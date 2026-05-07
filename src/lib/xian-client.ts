/**
 * Xian RPC client for the IDE.
 * Wraps ABCI queries for contract source, methods, state, simulation, and deployment.
 */

const DEFAULT_RPC = "http://127.0.0.1:26657";

let rpcUrl = DEFAULT_RPC;

export function setRpcUrl(url: string) {
  rpcUrl = url.replace(/\/+$/, "");
}

export function getRpcUrl(): string {
  return rpcUrl;
}

function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

async function abciQuery(path: string): Promise<unknown> {
  const url = `${rpcUrl}/abci_query?path=%22${encodeURIComponent(path)}%22`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`RPC error: ${resp.status}`);
  const data = await resp.json();
  const value = data?.result?.response?.value;
  if (!value) return null;
  try {
    return JSON.parse(base64ToUtf8(value));
  } catch {
    return base64ToUtf8(value);
  }
}

// ── Contract queries ──────────────────────────────────────────

export async function getContractSource(contract: string): Promise<string | null> {
  const result = await abciQuery(`/contract/${contract}`);
  return typeof result === "string" ? result : null;
}

export async function getContractMethods(
  contract: string
): Promise<Array<{ name: string; arguments: Array<{ name: string; type: string }> }>> {
  const result = await abciQuery(`/contract_methods/${contract}`);
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const methods = (result as { methods?: unknown }).methods;
    if (Array.isArray(methods)) return methods;
  }
  return [];
}

export async function getContractVars(
  contract: string
): Promise<{ variables: string[]; hashes: string[] }> {
  const result = await abciQuery(`/contract_vars/${contract}`);
  if (Array.isArray(result)) return { variables: result as string[], hashes: [] };
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    return {
      variables: Array.isArray(r.variables) ? (r.variables as string[]) : [],
      hashes: Array.isArray(r.hashes) ? (r.hashes as string[]) : [],
    };
  }
  return { variables: [], hashes: [] };
}

/**
 * Scan contract source for function names decorated with @export.
 * Walks each `def` line and looks at the consecutive decorator block above it.
 */
export function exportedFunctionNames(source: string): Set<string> {
  const names = new Set<string>();
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*def\s+([A-Za-z_]\w*)\s*\(/);
    if (!m) continue;
    for (let j = i - 1; j >= 0; j--) {
      const stripped = lines[j].trim();
      if (stripped === "") continue;
      if (!stripped.startsWith("@")) break;
      if (/^@export\b/.test(stripped)) {
        names.add(m[1]);
        break;
      }
    }
  }
  return names;
}

export async function getState(key: string): Promise<unknown> {
  return abciQuery(`/get/${key}`);
}

// ── Simulation ────────────────────────────────────────────────

export interface SimulationResult {
  success: boolean;
  chiUsed: number;
  result: unknown;
  error?: string;
  stateChanges?: Record<string, unknown>;
}

function sortedJsonEncode(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(sortedJsonEncode).join(",")}]`;
  if (typeof obj === "object") {
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    const entries = sorted.map(
      (k) => `${JSON.stringify(k)}:${sortedJsonEncode((obj as Record<string, unknown>)[k])}`
    );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(obj);
}

export async function simulate(payload: {
  sender: string;
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
}): Promise<SimulationResult> {
  const encoded = sortedJsonEncode(payload);
  const hex = Array.from(new TextEncoder().encode(encoded))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const url = `${rpcUrl}/abci_query?path=%22/simulate_tx/${hex}%22`;
  const resp = await fetch(url);
  if (!resp.ok) {
    return { success: false, chiUsed: 0, result: null, error: `RPC error: ${resp.status}` };
  }
  const raw = await resp.json();
  const response = raw?.result?.response;
  if (!response) {
    return { success: false, chiUsed: 0, result: null, error: "No simulation response" };
  }

  if (response.code !== 0) {
    return { success: false, chiUsed: 0, result: null, error: response.log ?? `code ${response.code}` };
  }

  try {
    const decoded = JSON.parse(base64ToUtf8(response.value));
    const stateChanges = decoded.state_changes ?? decoded.state;
    return {
      success: decoded.status === 0,
      chiUsed: Number(decoded.chi_used ?? 0),
      result: decoded.result ?? null,
      error: decoded.status !== 0 ? String(decoded.result ?? "Simulation failed") : undefined,
      stateChanges: typeof stateChanges === "object" ? stateChanges : undefined,
    };
  } catch {
    return { success: false, chiUsed: 0, result: null, error: "Failed to parse simulation result" };
  }
}

// ── Chain info ────────────────────────────────────────────────

export async function getChainId(): Promise<string> {
  const resp = await fetch(`${rpcUrl}/status`);
  if (!resp.ok) throw new Error(`RPC error: ${resp.status}`);
  const data = await resp.json();
  return data?.result?.node_info?.network ?? "unknown";
}

export async function getNonce(address: string): Promise<number> {
  const result = await abciQuery(`/get_next_nonce/${address}`);
  return Number(result ?? 0);
}

// ── Health check ──────────────────────────────────────────────

export async function checkConnection(): Promise<boolean> {
  try {
    const resp = await fetch(`${rpcUrl}/status`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}
