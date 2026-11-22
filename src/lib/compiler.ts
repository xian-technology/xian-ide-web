import {
  compileContractArtifactJson,
  compilerVersionJson,
  diagnoseContractJson,
} from "@xian-tech/compiler";

import { DEFAULT_VM_PROFILE } from "./profile";
export { DEFAULT_VM_PROFILE };

export interface ContractDeploymentArtifacts {
  format: string;
  module_name?: string;
  vm_profile?: string;
  source?: string;
  vm_ir_json?: string;
  hashes?: Record<string, string>;
  [key: string]: unknown;
}

export interface CompilerSourceRange {
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
}

export interface CompilerDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  range?: CompilerSourceRange | null;
}

export interface EditorDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

const COMPILE_OPTIONS_JSON = JSON.stringify({ vm_profile: DEFAULT_VM_PROFILE });

function parseArtifactJson(raw: string): ContractDeploymentArtifacts {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("compiler returned a non-object deployment artifact");
  }
  return parsed as ContractDeploymentArtifacts;
}

function parseDiagnosticsJson(raw: string): CompilerDiagnostic[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("compiler returned non-array diagnostics");
  }
  return parsed.map((diagnostic) => {
    if (
      typeof diagnostic !== "object" ||
      diagnostic === null ||
      Array.isArray(diagnostic)
    ) {
      throw new Error("compiler returned malformed diagnostics");
    }
    const value = diagnostic as Partial<CompilerDiagnostic>;
    if (
      value.severity !== "error" &&
      value.severity !== "warning" &&
      value.severity !== "info"
    ) {
      throw new Error("compiler returned a diagnostic with invalid severity");
    }
    if (typeof value.code !== "string" || typeof value.message !== "string") {
      throw new Error("compiler returned a diagnostic without code or message");
    }
    return value as CompilerDiagnostic;
  });
}

function validateArtifactShape(
  moduleName: string,
  artifact: ContractDeploymentArtifacts
): void {
  if (artifact.format !== "xian_contract_artifact_v1") {
    throw new Error("compiler returned an unsupported artifact format");
  }
  if (artifact.module_name !== moduleName) {
    throw new Error("compiler returned artifacts for a different module");
  }
  if (artifact.vm_profile !== DEFAULT_VM_PROFILE) {
    throw new Error("compiler returned artifacts for a different VM profile");
  }
  if (typeof artifact.source !== "string" || artifact.source.length === 0) {
    throw new Error("compiler artifact is missing canonical source");
  }
  if (
    typeof artifact.vm_ir_json !== "string" ||
    artifact.vm_ir_json.length === 0
  ) {
    throw new Error("compiler artifact is missing Xian VM IR");
  }
  if (
    typeof artifact.hashes !== "object" ||
    artifact.hashes === null ||
    typeof artifact.hashes.source_sha256 !== "string" ||
    typeof artifact.hashes.vm_ir_sha256 !== "string"
  ) {
    throw new Error("compiler artifact is missing source or IR hashes");
  }
  if ("runtime_code" in artifact) {
    throw new Error("compiler artifact must not include runtime_code");
  }
}

export function compileContractArtifacts(
  moduleName: string,
  source: string
): ContractDeploymentArtifacts {
  const rawArtifact = compileContractArtifactJson(moduleName, source, COMPILE_OPTIONS_JSON);
  const artifact = parseArtifactJson(rawArtifact);
  validateArtifactShape(moduleName, artifact);
  return artifact;
}

export function diagnoseContract(
  moduleName: string,
  source: string
): CompilerDiagnostic[] {
  const rawDiagnostics = diagnoseContractJson(moduleName, source, COMPILE_OPTIONS_JSON);
  return parseDiagnosticsJson(rawDiagnostics);
}

/** Monaco indexes UTF-16 code units, while the compiler reports code points. */
function editorColumn(line: string | undefined, column: number): number {
  return (line === undefined ? column : [...line].slice(0, column).join("").length) + 1;
}

export function toEditorDiagnostic(diagnostic: CompilerDiagnostic, sourceLines: readonly string[]): EditorDiagnostic {
  const {
    start_line: line,
    start_column: column,
    end_line: endLine,
    end_column: endColumn,
  } = diagnostic.range ?? { start_line: 1, start_column: 0, end_line: 1, end_column: 0 };
  return {
    severity: diagnostic.severity === "warning" ? "warning" : "error",
    code: diagnostic.code,
    message: diagnostic.message,
    line,
    col: editorColumn(sourceLines[line - 1], column),
    endLine,
    endCol: editorColumn(sourceLines[endLine - 1], endColumn),
  };
}

export function getCompilerVersion(): Record<string, unknown> {
  return JSON.parse(compilerVersionJson()) as Record<string, unknown>;
}

export function compilerErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split("\n", 1)[0]?.trim();
  return firstLine || "compiler failed";
}
