export const LOCAL_RPC = "http://127.0.0.1:26657";
export const DEFAULT_RPC =
  import.meta.env.VITE_XIAN_RPC_URL?.trim().replace(/\/+$/, "") || LOCAL_RPC;
export const DEFAULT_NETWORK_NAME =
  import.meta.env.VITE_XIAN_NETWORK_LABEL?.trim() || "Configured network";

export const NETWORK_PRESETS = [
  ...(DEFAULT_RPC !== LOCAL_RPC
    ? [{ name: DEFAULT_NETWORK_NAME, url: DEFAULT_RPC }]
    : []),
  { name: "Local", url: LOCAL_RPC },
];
