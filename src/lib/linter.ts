/**
 * Xian contract linter integration.
 * Calls the xian-linter HTTP server at /lint.
 *
 * Start the linter server with:
 *   uv add "xian-tech-linter[server]"
 *   uvicorn xian_linter.server:create_app --factory --port 8000
 */

let linterUrl = "http://127.0.0.1:8000";

export function setLinterUrl(url: string) {
  linterUrl = url.replace(/\/+$/, "");
}

export function getLinterUrl(): string {
  return linterUrl;
}

export interface LintError {
  code: string;
  message: string;
  severity?: "error" | "warning";
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
}

export interface LintResult {
  success: boolean;
  errors: LintError[];
}

interface ServerLintError {
  code: string;
  message: string;
  severity?: "error" | "warning";
  line?: number;
  col?: number;
  position?: {
    line?: number;
    col?: number;
    end_line?: number;
    end_col?: number;
  } | null;
}

interface ServerLintResult {
  success: boolean;
  errors?: ServerLintError[];
}

function toEditorColumn(col: number | undefined): number | undefined {
  if (col === undefined || !Number.isFinite(col)) return undefined;
  return Math.max(1, col + 1);
}

function normalizeLintError(error: ServerLintError): LintError {
  const position = error.position ?? undefined;
  const line = error.line ?? position?.line;
  const col = error.col ?? toEditorColumn(position?.col);
  const endLine = position?.end_line ?? line;
  let endCol = toEditorColumn(position?.end_col) ?? (col ? col + 1 : undefined);
  if (line && endLine === line && col && endCol !== undefined && endCol <= col) {
    endCol = col + 1;
  }

  return {
    code: error.code,
    message: error.message,
    severity: error.severity,
    line,
    col,
    endLine,
    endCol,
  };
}

function normalizeLintResult(result: ServerLintResult): LintResult {
  return {
    success: result.success,
    errors: (result.errors ?? []).map(normalizeLintError),
  };
}

export async function lintCode(code: string): Promise<LintResult> {
  try {
    const resp = await fetch(`${linterUrl}/lint`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: code,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      return { success: false, errors: [{ code: "E000", message: `Linter HTTP ${resp.status}` }] };
    }
    return normalizeLintResult(await resp.json());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("abort")) {
      return { success: false, errors: [{ code: "E000", message: "Linter server not reachable (timeout)" }] };
    }
    return { success: false, errors: [{ code: "E000", message: `Linter: ${msg}` }] };
  }
}

export async function checkLinterAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(`${linterUrl}/docs`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}
