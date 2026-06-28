export interface WalletSendCallRequest {
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
  chi?: number;
}

export type WalletSendCall = (payload: WalletSendCallRequest) => Promise<unknown>;

export interface DeployContractSourceOptions {
  name: string;
  source: string;
  constructorArgs?: Record<string, unknown>;
  sendCall: WalletSendCall;
}

function hasConstructorArgs(args: Record<string, unknown> | undefined): boolean {
  return args !== undefined && Object.keys(args).length > 0;
}

export async function deployContractSource(
  options: DeployContractSourceOptions
): Promise<unknown> {
  if (typeof options.source !== "string" || options.source.length === 0) {
    throw new Error("contract source must be a non-empty string");
  }

  const kwargs: Record<string, unknown> = {
    name: options.name,
    code: options.source,
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
