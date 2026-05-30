import {
  connectWallet,
  getAccounts,
  getInjectedWallet,
  getWalletInfo,
  isWalletAvailable,
  onAccountsChanged,
  onChainChanged,
  signMessage,
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

export async function sendCall(payload: {
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
  chi?: number;
}): Promise<unknown> {
  const wallet = getInjectedWallet();
  if (!wallet) {
    throw new Error("Xian wallet extension not detected. Install it and reload.");
  }
  const intent: Record<string, unknown> = {
    contract: payload.contract,
    function: payload.function,
    kwargs: payload.kwargs
  };
  if (payload.chi !== undefined) {
    intent.chiSupplied = payload.chi;
  }
  return wallet.request({
    method: "xian_sendCall",
    params: [{ intent }]
  });
}
