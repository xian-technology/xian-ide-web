import { useState, useCallback, useRef, useEffect } from "react";
import * as rpc from "../lib/xian-client";
import * as wallet from "../lib/wallet";
import * as linter from "../lib/linter";

export interface ContractFile {
  id: string;
  name: string;
  code: string;
  dirty: boolean;
  fromChain?: boolean;
}

export interface ConsoleEntry {
  id: string;
  type: "info" | "success" | "error" | "result";
  message: string;
  timestamp: number;
}

export interface ContractMethod {
  name: string;
  arguments: Array<{ name: string; type: string }>;
}

export function useIDE() {
  // Files
  const [files, setFiles] = useState<ContractFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Console
  const [console, setConsole] = useState<ConsoleEntry[]>([]);

  // Wallet
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAccount, setWalletAccount] = useState<string | null>(null);

  // Network
  const [networkUrl, setNetworkUrl] = useState("http://127.0.0.1:26657");
  const [networkOnline, setNetworkOnline] = useState(false);

  // Contract explorer
  const [loadedMethods, setLoadedMethods] = useState<ContractMethod[]>([]);
  const [loadedVars, setLoadedVars] = useState<string[]>([]);
  const [explorerContract, setExplorerContract] = useState("");

  // Loading states
  const [deploying, setDeploying] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [linting, setLinting] = useState(false);
  const [linterAvailable, setLinterAvailable] = useState(false);

  const idCounter = useRef(0);
  const genId = () => `f${++idCounter.current}`;

  // ── Console ────────────────────────────────────────────────

  const log = useCallback((type: ConsoleEntry["type"], message: string) => {
    setConsole((prev) => [
      ...prev,
      { id: `c${Date.now()}-${Math.random()}`, type, message, timestamp: Date.now() },
    ]);
  }, []);

  const clearConsole = useCallback(() => setConsole([]), []);

  // ── Files ──────────────────────────────────────────────────

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;

  const createFile = useCallback(
    (name: string, code: string, fromChain = false) => {
      const id = genId();
      const file: ContractFile = { id, name, code, dirty: false, fromChain };
      setFiles((prev) => [...prev, file]);
      setActiveFileId(id);
      return id;
    },
    []
  );

  const updateFileCode = useCallback((id: string, code: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, code, dirty: true } : f))
    );
  }, []);

  const renameFile = useCallback((id: string, name: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name } : f))
    );
  }, []);

  const closeFile = useCallback(
    (id: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (activeFileId === id) {
        setActiveFileId(() => {
          const remaining = files.filter((f) => f.id !== id);
          return remaining.length > 0 ? remaining[remaining.length - 1]!.id : null;
        });
      }
    },
    [activeFileId, files]
  );

  // ── Network ────────────────────────────────────────────────

  const changeNetwork = useCallback(
    async (url: string) => {
      setNetworkUrl(url);
      rpc.setRpcUrl(url);
      const online = await rpc.checkConnection();
      setNetworkOnline(online);
      log(online ? "success" : "error", online ? `Connected to ${url}` : `Cannot reach ${url}`);
    },
    [log]
  );

  // Check connection on mount
  useEffect(() => {
    rpc.setRpcUrl(networkUrl);
    rpc.checkConnection().then(setNetworkOnline);
    linter.checkLinterAvailable().then(setLinterAvailable);
  }, [networkUrl]);

  // ── Wallet ─────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    try {
      const accounts = await wallet.connect();
      if (accounts.length > 0) {
        setWalletConnected(true);
        setWalletAccount(accounts[0]!);
        log("success", `Wallet connected: ${accounts[0]!.slice(0, 8)}...${accounts[0]!.slice(-6)}`);
      }
    } catch (e) {
      log("error", `Wallet: ${e instanceof Error ? e.message : "Connection failed"}`);
    }
  }, [log]);

  const disconnectWallet = useCallback(() => {
    setWalletConnected(false);
    setWalletAccount(null);
    log("info", "Wallet disconnected");
  }, [log]);

  // ── Contract Explorer ──────────────────────────────────────

  const loadContractFromChain = useCallback(
    async (contractName: string) => {
      try {
        log("info", `Loading ${contractName} from chain...`);
        const source = await rpc.getContractSource(contractName);
        if (!source) {
          log("error", `Contract "${contractName}" not found`);
          return;
        }
        createFile(contractName, source, true);
        log("success", `Loaded ${contractName}`);
      } catch (e) {
        log("error", `Failed to load: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [createFile, log]
  );

  const loadContractMethods = useCallback(
    async (contractName: string) => {
      try {
        const methods = await rpc.getContractMethods(contractName);
        const vars = await rpc.getContractVars(contractName);
        setLoadedMethods(methods);
        setLoadedVars(vars);
        setExplorerContract(contractName);
        log("info", `${contractName}: ${methods.length} functions, ${vars.length} variables`);
      } catch (e) {
        log("error", `Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [log]
  );

  // ── Simulate ───────────────────────────────────────────────

  const simulateCall = useCallback(
    async (contract: string, func: string, kwargs: Record<string, unknown>) => {
      if (!walletAccount) {
        log("error", "Connect wallet first");
        return null;
      }
      setSimulating(true);
      try {
        log("info", `Simulating ${contract}.${func}(${JSON.stringify(kwargs)})...`);
        const result = await rpc.simulate({
          sender: walletAccount,
          contract,
          function: func,
          kwargs,
        });
        if (result.success) {
          log("success", `Simulation OK — ${result.stampsUsed} stamps used`);
          if (result.result !== null && result.result !== undefined) {
            log("result", JSON.stringify(result.result, null, 2));
          }
        } else {
          log("error", `Simulation failed: ${result.error ?? "Unknown error"}`);
        }
        return result;
      } catch (e) {
        log("error", `Simulation error: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally {
        setSimulating(false);
      }
    },
    [walletAccount, log]
  );

  // ── Deploy ─────────────────────────────────────────────────

  const deployContract = useCallback(
    async (name: string, code: string) => {
      if (!walletConnected) {
        log("error", "Connect wallet first");
        return;
      }
      setDeploying(true);
      try {
        log("info", `Simulating deployment of "${name}"...`);

        const estResult = await rpc.simulate({
          sender: walletAccount!,
          contract: "submission",
          function: "submit_contract",
          kwargs: { name, code },
        });

        if (!estResult.success) {
          log("error", `Simulation failed: ${estResult.error ?? "Unknown error"}`);
          setDeploying(false);
          return;
        }

        const stamps = estResult.stampsUsed;
        log("info", `Simulation OK — ${stamps.toLocaleString()} stamps needed. Sending to wallet...`);

        const result = await wallet.sendCall({
          contract: "submission",
          function: "submit_contract",
          kwargs: { name, code },
          stamps,
        });

        log("success", `Contract "${name}" deployed!`);
        log("result", JSON.stringify(result, null, 2));
      } catch (e) {
        log("error", `Deploy failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setDeploying(false);
      }
    },
    [walletConnected, walletAccount, log]
  );

  // ── Execute function on-chain ──────────────────────────────

  const executeFunction = useCallback(
    async (contract: string, func: string, kwargs: Record<string, unknown>, stamps?: number) => {
      if (!walletConnected) {
        log("error", "Connect wallet first");
        return;
      }
      try {
        log("info", `Simulating ${contract}.${func}()...`);

        let stampCount = stamps;
        if (!stampCount) {
          const est = await rpc.simulate({
            sender: walletAccount!,
            contract,
            function: func,
            kwargs,
          });
          if (!est.success) {
            log("error", `Simulation failed: ${est.error ?? "Unknown error"}`);
            return;
          }
          stampCount = est.stampsUsed;
          log("info", `Simulation OK — ${stampCount.toLocaleString()} stamps. Sending to wallet...`);
        }

        const result = await wallet.sendCall({
          contract,
          function: func,
          kwargs,
          stamps: stampCount,
        });

        log("success", `${contract}.${func}() executed`);
        log("result", JSON.stringify(result, null, 2));
      } catch (e) {
        log("error", `Execute failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [walletConnected, walletAccount, log]
  );

  // ── Query state ────────────────────────────────────────────

  const queryState = useCallback(
    async (key: string) => {
      try {
        const result = await rpc.getState(key);
        log("result", `${key} = ${JSON.stringify(result)}`);
        return result;
      } catch (e) {
        log("error", `Query failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    },
    [log]
  );

  return {
    // Files
    files,
    activeFile,
    activeFileId,
    setActiveFileId,
    createFile,
    updateFileCode,
    renameFile,
    closeFile,

    // Console
    console,
    log,
    clearConsole,

    // Wallet
    walletConnected,
    walletAccount,
    connectWallet,
    disconnectWallet,

    // Network
    networkUrl,
    networkOnline,
    changeNetwork,

    // Explorer
    explorerContract,
    loadedMethods,
    loadedVars,
    loadContractFromChain,
    loadContractMethods,

    // Actions
    simulateCall,
    deployContract,
    executeFunction,
    queryState,
    deploying,
    simulating,

    // Linter
    linting,
    linterAvailable,
    lintCurrentFile: useCallback(async () => {
      if (!activeFile) { log("error", "No file open"); return; }
      setLinting(true);
      try {
        const result = await linter.lintCode(activeFile.code);
        if (result.success) {
          log("success", "Lint passed — no errors");
        } else {
          for (const err of result.errors) {
            const loc = err.line ? ` (line ${err.line}${err.col ? `:${err.col}` : ""})` : "";
            log("error", `[${err.code}]${loc} ${err.message}`);
          }
          log("error", `Lint: ${result.errors.length} error(s)`);
        }
      } catch (e) {
        log("error", `Lint failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLinting(false);
      }
    }, [activeFile, log]),
  };
}
