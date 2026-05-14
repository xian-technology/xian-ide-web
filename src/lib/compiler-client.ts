import type {
  CompileContractOptions,
  CompilerDiagnostic,
  ContractDeploymentArtifacts,
} from "./compiler";
import {
  compileContractArtifacts,
  diagnoseContract,
  getCompilerVersion,
} from "./compiler";

export async function compileContractArtifactsInBrowser(
  moduleName: string,
  source: string,
  options?: CompileContractOptions
): Promise<ContractDeploymentArtifacts> {
  return compileContractArtifacts(moduleName, source, options);
}

export async function diagnoseContractInBrowser(
  moduleName: string,
  source: string,
  options?: CompileContractOptions
): Promise<CompilerDiagnostic[]> {
  return diagnoseContract(moduleName, source, options);
}

export async function getCompilerVersionInBrowser(): Promise<Record<string, unknown>> {
  return getCompilerVersion();
}
