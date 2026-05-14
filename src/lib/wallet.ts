/**
 * Wallet integration via window.xian provider (injected by the browser extension).
 */

export interface WalletInfo {
  connected: boolean;
  locked: boolean;
  accounts: string[];
  selectedAccount?: string;
  chainId?: string;
}

type XianProviderRequestArgs = {
  method: string;
  params?: unknown[];
};

type XianProvider = {
  request(args: XianProviderRequestArgs): Promise<unknown>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  removeListener(event: string, cb: (...args: unknown[]) => void): void;
};

type XianWindow = Window & {
  xian?: {
    provider?: XianProvider;
  };
};

export function isWalletAvailable(): boolean {
  return typeof window !== "undefined" && !!(window as XianWindow).xian?.provider;
}

function getProvider(): XianProvider {
  const provider = (window as XianWindow).xian?.provider;
  if (!provider) {
    throw new Error("Xian wallet extension not detected. Install it and reload.");
  }
  return provider;
}

async function request(method: string, params?: unknown[]): Promise<unknown> {
  return getProvider().request({ method, params: params ?? [] });
}

export async function connect(): Promise<string[]> {
  const accounts = (await request("xian_requestAccounts")) as string[];
  return accounts;
}

export async function getWalletInfo(): Promise<WalletInfo> {
  const info = (await request("xian_getWalletInfo")) as WalletInfo;
  return info;
}

export async function getAccounts(): Promise<string[]> {
  return (await request("xian_accounts")) as string[];
}

export async function sendCall(payload: {
  contract: string;
  function: string;
  kwargs: Record<string, unknown>;
  chi?: number;
}): Promise<unknown> {
  const intent: Record<string, unknown> = {
    contract: payload.contract,
    function: payload.function,
    kwargs: payload.kwargs,
  };
  if (payload.chi !== undefined) {
    intent.chiSupplied = payload.chi;
  }
  return request("xian_sendCall", [{
    intent,
  }]);
}

export async function signMessage(message: string): Promise<string> {
  return (await request("xian_signMessage", [{ message }])) as string;
}

// Listen for account/chain changes
export function onAccountsChanged(cb: (accounts: string[]) => void): () => void {
  if (!isWalletAvailable()) return () => {};
  const p = getProvider();
  const handler = (accounts: unknown) => cb(accounts as string[]);
  p.on("accountsChanged", handler);
  return () => p.removeListener("accountsChanged", handler);
}

export function onChainChanged(cb: (chainId: string) => void): () => void {
  if (!isWalletAvailable()) return () => {};
  const p = getProvider();
  const handler = (chainId: unknown) => cb(chainId as string);
  p.on("chainChanged", handler);
  return () => p.removeListener("chainChanged", handler);
}
