import { useState, useCallback, useEffect, useRef } from "react";
import * as rpc from "../lib/xian-client";
import * as wallet from "../lib/wallet";
import * as linter from "../lib/linter";
import type { LintError } from "../lib/linter";

export interface ContractFile {
  id: string;
  name: string;
  code: string;
  dirty: boolean;
  fromChain?: boolean;
}

type FilePlacement = "before" | "after";

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

const STORAGE_FILES = "xian-ide-files";
const STORAGE_ACTIVE = "xian-ide-active-file";
const STORAGE_NETWORK = "xian-ide-network-url";
const STORAGE_LINTER = "xian-ide-linter-url";
const DEFAULT_NETWORK = "http://127.0.0.1:26657";

function loadFiles(): ContractFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_FILES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (f): f is ContractFile =>
          f && typeof f.id === "string" && typeof f.name === "string" && typeof f.code === "string"
      )
      .map((f) => ({
        ...f,
        dirty: false,
        fromChain: f.fromChain === true || !f.name.toLowerCase().endsWith(".py"),
      }));
  } catch {
    return [];
  }
}

function loadActiveId(files: ContractFile[]): string | null {
  try {
    const id = localStorage.getItem(STORAGE_ACTIVE);
    if (!id) return null;
    return files.some((f) => f.id === id) ? id : null;
  } catch {
    return null;
  }
}

function loadNetwork(): string {
  try {
    return localStorage.getItem(STORAGE_NETWORK) || DEFAULT_NETWORK;
  } catch {
    return DEFAULT_NETWORK;
  }
}

function loadLinterUrl(): string {
  try {
    return linter.normalizeLinterUrl(localStorage.getItem(STORAGE_LINTER) || linter.DEFAULT_LINTER_URL);
  } catch {
    return linter.DEFAULT_LINTER_URL;
  }
}

export function useIDE() {
  // Files (persisted) — lazy init reads localStorage once
  const [files, setFiles] = useState<ContractFile[]>(loadFiles);
  const [activeFileId, setActiveFileId] = useState<string | null>(() =>
    loadActiveId(loadFiles())
  );

  // Console
  const [console, setConsole] = useState<ConsoleEntry[]>([]);

  // Wallet
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAccount, setWalletAccount] = useState<string | null>(null);

  // Network (persisted)
  const [networkUrl, setNetworkUrl] = useState<string>(loadNetwork);
  const [networkOnline, setNetworkOnline] = useState(false);

  // Linter (persisted)
  const [linterUrl, setLinterUrl] = useState<string>(loadLinterUrl);
  const [linterAvailable, setLinterAvailable] = useState(false);

  // Contract explorer
  const [loadedMethods, setLoadedMethods] = useState<ContractMethod[]>([]);
  const [loadedVars, setLoadedVars] = useState<string[]>([]);
  const [explorerContract, setExplorerContract] = useState("");

  // Loading states
  const [deploying, setDeploying] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [linting, setLinting] = useState(false);
  const executingRef = useRef(false);
  const explorerRequestRef = useRef(0);
  const activeExplorerKeyRef = useRef<string | null>(null);

  // Lint errors keyed by file id, so they survive rehydration and stay scoped
  const [lintErrorsByFile, setLintErrorsByFile] = useState<Record<string, LintError[]>>({});
  const lintErrors = activeFileId ? lintErrorsByFile[activeFileId] ?? [] : [];

  // Random ID — collision-free without needing to inspect persisted files
  const genId = () =>
    `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FILES, JSON.stringify(files));
    } catch { /* quota or disabled */ }
  }, [files]);
  useEffect(() => {
    try {
      if (activeFileId) localStorage.setItem(STORAGE_ACTIVE, activeFileId);
      else localStorage.removeItem(STORAGE_ACTIVE);
    } catch { /* ignore */ }
  }, [activeFileId]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NETWORK, networkUrl);
    } catch { /* ignore */ }
  }, [networkUrl]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LINTER, linterUrl);
    } catch { /* ignore */ }
  }, [linterUrl]);

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
      prev.map((f) =>
        f.id === id && !f.fromChain ? { ...f, code, dirty: false } : f
      )
    );
  }, []);

  const renameFile = useCallback((id: string, name: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id && !f.fromChain ? { ...f, name } : f
      )
    );
  }, []);

  const reorderFile = useCallback(
    (sourceId: string, targetId: string, placement: FilePlacement) => {
      if (sourceId === targetId) return;
      setFiles((prev) => {
        const source = prev.find((f) => f.id === sourceId);
        if (!source) return prev;
        const withoutSource = prev.filter((f) => f.id !== sourceId);
        const targetIndex = withoutSource.findIndex((f) => f.id === targetId);
        if (targetIndex === -1) return prev;
        const insertAt = placement === "after" ? targetIndex + 1 : targetIndex;
        return [
          ...withoutSource.slice(0, insertAt),
          source,
          ...withoutSource.slice(insertAt),
        ];
      });
    },
    []
  );

  const closeFile = useCallback(
    (id: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setLintErrorsByFile((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeFileId === id) {
        setActiveFileId(() => {
          const remaining = files.filter((f) => f.id !== id);
          return remaining.length > 0 ? remaining[remaining.length - 1]!.id : null;
        });
      }
    },
    [activeFileId, files]
  );

  const markFileSaved = useCallback((id: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, dirty: false } : f)));
  }, []);

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

  const changeLinterUrl = useCallback(
    async (url: string) => {
      const normalized = linter.normalizeLinterUrl(url);
      setLinterUrl(normalized);
      linter.setLinterUrl(normalized);
      const available = await linter.checkLinterAvailable();
      setLinterAvailable(available);
      log(
        available ? "success" : "error",
        available ? `Linter connected: ${normalized}` : `Cannot reach linter: ${normalized}`
      );
    },
    [log]
  );

  // Check connections on mount and endpoint changes
  useEffect(() => {
    rpc.setRpcUrl(networkUrl);
    rpc.checkConnection().then(setNetworkOnline);
  }, [networkUrl]);

  useEffect(() => {
    linter.setLinterUrl(linterUrl);
    linter.checkLinterAvailable().then(setLinterAvailable);
  }, [linterUrl]);

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
      const requestId = ++explorerRequestRef.current;
      try {
        const [source, methods, vars] = await Promise.all([
          rpc.getContractSource(contractName),
          rpc.getContractMethods(contractName),
          rpc.getContractVars(contractName),
        ]);
        if (requestId !== explorerRequestRef.current) return;
        const exported = source ? rpc.exportedFunctionNames(source) : null;
        const callable = exported
          ? methods.filter((m) => exported.has(m.name))
          : methods;
        const allVars = [...vars.variables, ...vars.hashes];
        setLoadedMethods(callable);
        setLoadedVars(allVars);
        setExplorerContract(contractName);
        log(
          "info",
          `${contractName}: ${callable.length} callable, ${allVars.length} variables`
        );
      } catch (e) {
        if (requestId !== explorerRequestRef.current) return;
        setLoadedMethods([]);
        setLoadedVars([]);
        setExplorerContract(contractName);
        log("error", `Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [log]
  );

  useEffect(() => {
    if (activeFile?.fromChain !== true) {
      explorerRequestRef.current += 1;
      activeExplorerKeyRef.current = null;
      return;
    }
    const explorerKey = `${networkUrl}:${activeFile.id}:${activeFile.name}`;
    if (activeExplorerKeyRef.current === explorerKey) return;
    activeExplorerKeyRef.current = explorerKey;
    const contractName = activeFile.name;
    void Promise.resolve().then(() => loadContractMethods(contractName));
  }, [activeFile, loadContractMethods, networkUrl]);

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
          log("success", `Simulation OK — ${result.chiUsed} chi used`);
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

        const chi = estResult.chiUsed;
        log("info", `Simulation OK — ${chi.toLocaleString()} chi needed. Sending to wallet...`);

        const result = await wallet.sendCall({
          contract: "submission",
          function: "submit_contract",
          kwargs: { name, code },
          chi,
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
    async (contract: string, func: string, kwargs: Record<string, unknown>, chi?: number) => {
      if (!walletConnected) {
        log("error", "Connect wallet first");
        return;
      }
      if (executingRef.current) {
        log("info", "Execute already in progress");
        return;
      }
      executingRef.current = true;
      setExecuting(true);
      try {
        log("info", `Simulating ${contract}.${func}()...`);

        let chiBudget = chi;
        if (!chiBudget) {
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
          chiBudget = est.chiUsed;
          log("info", `Simulation OK — ${chiBudget.toLocaleString()} chi. Sending to wallet...`);
        }

        const result = await wallet.sendCall({
          contract,
          function: func,
          kwargs,
          chi: chiBudget,
        });

        log("success", `${contract}.${func}() executed`);
        log("result", JSON.stringify(result, null, 2));
      } catch (e) {
        log("error", `Execute failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        executingRef.current = false;
        setExecuting(false);
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

  const lintCurrentFile = useCallback(async () => {
    if (!activeFile) { log("error", "No file open"); return; }
    const fileId = activeFile.id;
    setLinting(true);
    try {
      const result = await linter.lintCode(activeFile.code);
      if (result.success) {
        log("success", "Lint passed — no errors");
        setLintErrorsByFile((prev) => ({ ...prev, [fileId]: [] }));
      } else {
        for (const err of result.errors) {
          const loc = err.line
            ? ` (line ${err.line}${err.col !== undefined ? `:${err.col}` : ""})`
            : "";
          log("error", `[${err.code}]${loc} ${err.message}`);
        }
        log("error", `Lint: ${result.errors.length} error(s)`);
        setLintErrorsByFile((prev) => ({ ...prev, [fileId]: result.errors }));
      }
    } catch (e) {
      log("error", `Lint failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLinting(false);
    }
  }, [activeFile, log]);

  return {
    // Files
    files,
    activeFile,
    activeFileId,
    setActiveFileId,
    createFile,
    updateFileCode,
    renameFile,
    reorderFile,
    closeFile,
    markFileSaved,

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
    executing,

    // Linter
    linterUrl,
    linting,
    linterAvailable,
    changeLinterUrl,
    lintErrors,
    lintCurrentFile,
  };
}
