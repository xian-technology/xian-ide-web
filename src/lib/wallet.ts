import {
  assertSendCallSucceeded,
  connectWallet,
  getAccounts,
  getInjectedWallet,
  getWalletInfo,
  isWalletAvailable,
  onAccountsChanged,
  onChainChanged,
  signMessage,
  type SendCallResult,
  type WalletInfo
} from "@xian-tech/web-kit";

export {
  connectWallet as connect,
  getAccounts,
  getWalletInfo,
  isWalletAvailable,
  onAccountsChanged,
  onChainChanged,
  signMessage
};
export type { WalletInfo };

/**
 * Submit a contract call through the injected wallet, pinned to the chain the
 * IDE is connected to. Resolves only once the transaction executed
 * successfully: the provider itself resolves on CheckTx rejection and on
 * failed execution, so those outcomes are turned into errors here.
 */
export async function sendCall(payload: {
  chainId: string;
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
  chi?: number;
}): Promise<SendCallResult> {
  const wallet = getInjectedWallet();
  if (!wallet) {
    throw new Error("Xian wallet extension not detected. Install it and reload.");
  }
  const intent: Record<string, unknown> = {
    chainId: payload.chainId,
    contract: payload.contract,
    function: payload.function,
    kwargs: payload.kwargs
  };
  if (payload.chi !== undefined) {
    intent.chiSupplied = payload.chi;
  }
  const result = (await wallet.request({
    method: "xian_sendCall",
    params: [{ intent, mode: "checktx", waitForTx: true }]
  })) as SendCallResult;
  assertSendCallSucceeded(result);
  return result;
}
