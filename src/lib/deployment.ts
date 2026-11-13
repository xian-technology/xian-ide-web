export interface WalletSendCallRequest {
  chainId: string;
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
  chi?: number;
}

export type WalletSendCall = (payload: WalletSendCallRequest) => Promise<unknown>;

export interface DeployContractSourceOptions {
  /** Chain the IDE reads from; the wallet refuses to sign for another chain. */
  chainId: string;
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
    chainId: options.chainId,
    contract: "submission",
    function: "submit_contract",
    kwargs,
  });
}

export type SimulateCall = (request: {
  sender: string;
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
}) => Promise<{ success: boolean; chiUsed: number; error?: string }>;

export interface ExecuteContractCallOptions {
  /** Chain the IDE reads from; the wallet refuses to sign for another chain. */
  chainId: string;
  sender: string;
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
  /** Explicit chi budget; without one the call is simulated first. */
  chi?: number;
  simulate: SimulateCall;
  sendCall: WalletSendCall;
}

/**
 * Submit a contract call. A failing simulation stops it before the wallet;
 * a passing one supplies exactly its simulated cost, which execution
 * charges for the same chain state.
 */
export async function executeContractCall(options: ExecuteContractCallOptions): Promise<unknown> {
  let chi = options.chi;
  if (!chi) {
    const simulation = await options.simulate({
      sender: options.sender,
      contract: options.contract,
      function: options.function,
      kwargs: options.kwargs,
    });
    if (!simulation.success) {
      throw new Error(`Simulation failed: ${simulation.error || "Unknown error"}`);
    }
    chi = simulation.chiUsed;
  }
  return options.sendCall({
    chainId: options.chainId,
    contract: options.contract,
    function: options.function,
    kwargs: options.kwargs,
    chi,
  });
}
