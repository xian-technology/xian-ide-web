import { XianClient } from "@xian-tech/client";

const DEFAULT_RPC = "http://127.0.0.1:26657";

let rpcUrl = DEFAULT_RPC;
let client = new XianClient({ rpcUrl });

export function setRpcUrl(url: string) {
  rpcUrl = url.replace(/\/+$/, "");
  client = new XianClient({ rpcUrl });
}

export function getRpcUrl(): string {
  return rpcUrl;
}

// ── Contract queries ──────────────────────────────────────────

export async function getContractSource(contract: string): Promise<string | null> {
  return client.getContractSource(contract);
}

export async function getContractMethods(
  contract: string
): Promise<Array<{ name: string; arguments: Array<{ name: string; type: string }> }>> {
  return client.getContractMethods(contract);
}

export async function getContractVars(
  contract: string
): Promise<{ variables: string[]; hashes: string[] }> {
  return client.getContractVars(contract);
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
  return client.getStateKey(key);
}

// ── Simulation ────────────────────────────────────────────────

export interface SimulationResult {
  success: boolean;
  chiUsed: number;
  result: unknown;
  error?: string;
  stateChanges?: Record<string, unknown>;
}

export async function simulate(payload: {
  sender: string;
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
}): Promise<SimulationResult> {
  try {
    const decoded = await client.simulate(payload);
    const rawStateChanges = decoded.state_changes ?? decoded.state;
    const stateChanges =
      rawStateChanges !== null && typeof rawStateChanges === "object" && !Array.isArray(rawStateChanges)
        ? rawStateChanges as Record<string, unknown>
        : undefined;
    return {
      success: decoded.status === 0,
      chiUsed: Number(decoded.chi_used ?? 0),
      result: decoded.result ?? null,
      error: decoded.status !== 0 ? String(decoded.result ?? "Simulation failed") : undefined,
      stateChanges,
    };
  } catch (error) {
    return {
      success: false,
      chiUsed: 0,
      result: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ── Chain info ────────────────────────────────────────────────

export async function getChainId(): Promise<string> {
  const status = await client.getStatus();
  const result = status.result;
  const nodeInfo =
    typeof result === "object" && result !== null
      ? (result as { node_info?: unknown }).node_info
      : undefined;
  const network =
    typeof nodeInfo === "object" && nodeInfo !== null
      ? (nodeInfo as { network?: unknown }).network
      : undefined;
  return typeof network === "string" ? network : "unknown";
}

export async function getNonce(address: string): Promise<number> {
  return Number(await client.getNonce(address));
}

// ── Health check ──────────────────────────────────────────────

export async function checkConnection(): Promise<boolean> {
  try {
    await client.getStatus();
    return true;
  } catch {
    return false;
  }
}
