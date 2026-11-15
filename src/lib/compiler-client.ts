import type { CompilerDiagnostic, ContractDeploymentArtifacts } from "./compiler";
import {
  compileContractArtifacts,
  diagnoseContract,
  getCompilerVersion,
} from "./compiler";

export async function compileContractArtifactsInBrowser(
  moduleName: string,
  source: string
): Promise<ContractDeploymentArtifacts> {
  return compileContractArtifacts(moduleName, source);
}

export async function diagnoseContractInBrowser(
  moduleName: string,
  source: string
): Promise<CompilerDiagnostic[]> {
  return diagnoseContract(moduleName, source);
}

export async function getCompilerVersionInBrowser(): Promise<Record<string, unknown>> {
  return getCompilerVersion();
}
