import type {
  CompileContractOptions,
  ContractDeploymentArtifacts,
} from "./compiler";

export interface WalletSendCallRequest {
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
  chi?: number;
}

export type WalletSendCall = (payload: WalletSendCallRequest) => Promise<unknown>;

export type ContractCompiler = (
  moduleName: string,
  source: string,
  options?: CompileContractOptions
) => ContractDeploymentArtifacts | Promise<ContractDeploymentArtifacts>;

export interface DeployContractSourceOptions extends CompileContractOptions {
  name: string;
  source: string;
  constructorArgs?: Record<string, unknown>;
  compile: ContractCompiler;
  sendCall: WalletSendCall;
}

function hasConstructorArgs(args: Record<string, unknown> | undefined): boolean {
  return args !== undefined && Object.keys(args).length > 0;
}

export async function deployContractSource(
  options: DeployContractSourceOptions
): Promise<unknown> {
  const deploymentArtifacts: ContractDeploymentArtifacts =
    await options.compile(options.name, options.source, {
      lint: options.lint,
    });
  const kwargs: Record<string, unknown> = {
    name: options.name,
    deployment_artifacts: deploymentArtifacts,
  };
  if (hasConstructorArgs(options.constructorArgs)) {
    kwargs.constructor_args = options.constructorArgs;
  }

  return options.sendCall({
    contract: "submission",
    function: "submit_contract",
    kwargs,
  });
}
