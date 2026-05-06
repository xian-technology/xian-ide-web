import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  Upload, Search, Plus, X, Trash2, Terminal, Code2,
  Wallet, FileCode, Plug, Braces, AlertTriangle, Command,
  Copy, Play, Send, Zap, MessageSquare, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useIDE, type ContractMethod } from "./hooks/useIDE";
import { TEMPLATES } from "./lib/contract-templates";
import "./styles/ide.css";

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const NETWORK_PRESETS: Array<{ name: string; url: string }> = [
  { name: "Local", url: "http://127.0.0.1:26657" },
  { name: "Testnet", url: "https://testnet.xian.org" },
  { name: "Mainnet", url: "https://node.xian.org" },
];

const STORAGE_SIDEBAR_W = "xian-ide-sidebar-width";
const STORAGE_BOTTOM_H = "xian-ide-bottom-height";
const STORAGE_SIDEBAR_COLLAPSED = "xian-ide-sidebar-collapsed";

type ArgParseResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

type KwargsBuildResult =
  | { ok: true; kwargs: Record<string, unknown> }
  | { ok: false; message: string };

function loadNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  } catch {
    return fallback;
  }
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

function handleEditorWillMount(monaco: Monaco) {
  monaco.editor.defineTheme("xian-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6e6e82", fontStyle: "italic" },
      { token: "keyword", foreground: "22c55e" },
      { token: "string", foreground: "faad14" },
      { token: "number", foreground: "ff8c42" },
      { token: "type", foreground: "60a5fa" },
      { token: "function", foreground: "c084fc" },
      { token: "variable", foreground: "e8e8ef" },
      { token: "operator", foreground: "6e6e82" },
      { token: "decorator", foreground: "22c55e", fontStyle: "bold" },
    ],
    colors: {
      "editor.background": "#0a0a0f",
      "editor.foreground": "#e8e8ef",
      "editor.lineHighlightBackground": "#12121a",
      "editor.selectionBackground": "#22c55e30",
      "editor.inactiveSelectionBackground": "#22c55e15",
      "editorCursor.foreground": "#22c55e",
      "editorLineNumber.foreground": "#3a3a50",
      "editorLineNumber.activeForeground": "#6e6e82",
      "editorIndentGuide.background": "#1c1c28",
      "editorIndentGuide.activeBackground": "#2a2a40",
      "editorWidget.background": "#12121a",
      "editorWidget.border": "#1c1c28",
      "editorSuggestWidget.background": "#12121a",
      "editorSuggestWidget.border": "#1c1c28",
      "editorSuggestWidget.selectedBackground": "#22c55e20",
      "input.background": "#0a0a0f",
      "input.border": "#1c1c28",
      "scrollbarSlider.background": "#ffffff15",
      "scrollbarSlider.hoverBackground": "#ffffff25",
    },
  });
}

function parseArg(value: string, type: string, argName: string): ArgParseResult {
  const t = (type || "").toLowerCase();
  const raw = value.trim();
  if (raw === "") return { ok: true, value: null };
  if (t === "int" || t === "float" || t === "decimal" || t === "number") {
    const n = Number(raw);
    return { ok: true, value: Number.isFinite(n) ? n : value };
  }
  if (t === "bool") {
    const normalized = raw.toLowerCase();
    if (normalized === "true") return { ok: true, value: true };
    if (normalized === "false") return { ok: true, value: false };
    return { ok: false, message: `${argName} must be true or false` };
  }
  if (t === "list" || t === "dict" || t === "any" || t === "json") {
    try { return { ok: true, value: JSON.parse(value) }; } catch { return { ok: true, value }; }
  }
  return { ok: true, value };
}

export default function App() {
  const ide = useIDE();
  const [bottomTab, setBottomTab] = useState<"console" | "interact">("console");
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [networkInput, setNetworkInput] = useState(ide.networkUrl);
  const [contractInput, setContractInput] = useState("");
  const [stateKey, setStateKey] = useState("");
  const [deployName, setDeployName] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [methodArgs, setMethodArgs] = useState<Record<string, Record<string, string>>>({});

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const ideRef = useRef(ide);
  const deployNameRef = useRef(deployName);
  const contractInputRef = useRef<HTMLInputElement | null>(null);
  const stateKeyInputRef = useRef<HTMLInputElement | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);

  // Layout (persisted)
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    loadNum(STORAGE_SIDEBAR_W, 260, 180, 600)
  );
  const [bottomHeight, setBottomHeight] = useState(() =>
    loadNum(STORAGE_BOTTOM_H, 240, 80, 600)
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    loadBool(
      STORAGE_SIDEBAR_COLLAPSED,
      typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches
    )
  );

  useEffect(() => { ideRef.current = ide; }, [ide]);
  useEffect(() => { deployNameRef.current = deployName; }, [deployName]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_SIDEBAR_W, String(sidebarWidth)); } catch { /* ignore */ }
  }, [sidebarWidth]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_BOTTOM_H, String(bottomHeight)); } catch { /* ignore */ }
  }, [bottomHeight]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, String(sidebarCollapsed)); } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  // Toast helpers
  const showToast = useCallback((msg: string) => {
    const id = `t${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message: msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2200);
  }, []);

  // Apply lint errors as Monaco markers
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    const model = ed.getModel();
    if (!model) return;
    const markers = ide.lintErrors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      message: `[${e.code}] ${e.message}`,
      startLineNumber: e.line ?? 1,
      endLineNumber: e.line ?? 1,
      startColumn: e.col ?? 1,
      endColumn: (e.col ?? 1) + 1,
      source: "xian-linter",
    }));
    monaco.editor.setModelMarkers(model, "xian-lint", markers);
  }, [ide.lintErrors, ide.activeFileId]);

  // Editor mount
  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;

      editorInstance.addAction({
        id: "xian.deploy",
        label: "Xian: Deploy Contract",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD],
        run: () => {
          const i = ideRef.current;
          const name = deployNameRef.current.trim();
          if (!i.activeFile) { i.log("error", "No file open"); return; }
          if (!name) { i.log("error", "Enter a contract name in the Deploy panel first"); return; }
          if (!i.walletConnected) { i.log("error", "Connect wallet first"); return; }
          i.deployContract(name, i.activeFile.code);
        },
      });

      editorInstance.addAction({
        id: "xian.lint",
        label: "Xian: Lint Contract",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
        run: () => { ideRef.current.lintCurrentFile(); },
      });

      editorInstance.addAction({
        id: "xian.connectWallet",
        label: "Xian: Connect Wallet",
        run: () => { ideRef.current.connectWallet(); },
      });

      editorInstance.addAction({
        id: "xian.loadFromChain",
        label: "Xian: Load Contract from Chain",
        run: () => {
          contractInputRef.current?.focus();
          contractInputRef.current?.select();
        },
      });

      editorInstance.addAction({
        id: "xian.queryState",
        label: "Xian: Query State",
        run: () => {
          stateKeyInputRef.current?.focus();
          stateKeyInputRef.current?.select();
        },
      });
    },
    []
  );

  const ensureEditorAndOpenPalette = useCallback(() => {
    if (!editorRef.current) {
      ide.createFile("untitled.py", "");
      setTimeout(() => {
        editorRef.current?.focus();
        setTimeout(() => {
          editorRef.current?.trigger("xian", "editor.action.quickCommand", null);
        }, 50);
      }, 100);
    } else {
      editorRef.current.focus();
      setTimeout(() => {
        editorRef.current?.trigger("xian", "editor.action.quickCommand", null);
      }, 50);
    }
  }, [ide]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        ensureEditorAndOpenPalette();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [ensureEditorAndOpenPalette]);

  // Escape closes modals
  useEffect(() => {
    if (!showNetworkModal && !showTemplateModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowNetworkModal(false);
        setShowTemplateModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNetworkModal, showTemplateModal]);

  const openNetworkModal = useCallback(() => {
    setNetworkInput(ide.networkUrl);
    setShowNetworkModal(true);
  }, [ide.networkUrl]);

  // Auto-scroll console
  useEffect(() => {
    if (bottomTab === "console") {
      consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [ide.console, bottomTab]);

  // Resizers
  const startSidebarResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (sidebarCollapsed) return;
      const startX = e.clientX;
      const startW = sidebarWidth;
      const move = (ev: PointerEvent) => {
        setSidebarWidth(Math.max(180, Math.min(600, startW + ev.clientX - startX)));
      };
      const up = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [sidebarCollapsed, sidebarWidth]
  );

  const startBottomResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = bottomHeight;
      const move = (ev: PointerEvent) => {
        setBottomHeight(Math.max(80, Math.min(600, startH - (ev.clientY - startY))));
      };
      const up = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [bottomHeight]
  );

  const setMethodArg = useCallback((method: string, arg: string, value: string) => {
    setMethodArgs((prev) => ({
      ...prev,
      [method]: { ...(prev[method] ?? {}), [arg]: value },
    }));
  }, []);

  const buildKwargs = useCallback(
    (m: ContractMethod): KwargsBuildResult => {
      const args = methodArgs[m.name] ?? {};
      const out: Record<string, unknown> = {};
      for (const a of m.arguments) {
        const raw = args[a.name];
        if (raw !== undefined && raw !== "") {
          const parsed = parseArg(raw, a.type, `${m.name}.${a.name}`);
          if (!parsed.ok) return parsed;
          out[a.name] = parsed.value;
        }
      }
      return { ok: true, kwargs: out };
    },
    [methodArgs]
  );

  const dirtyCount = useMemo(() => ide.files.filter((f) => f.dirty).length, [ide.files]);

  // ── Sidebar ─────────────────────────────────────────────────

  const sidebar = (
    <aside
      className="ide-sidebar"
      style={{ width: sidebarWidth }}
      aria-label="Project sidebar"
    >
      <div className="sidebar-scroll">
        {/* Files */}
        <section className="sidebar-section sidebar-section-grow">
          <div className="sidebar-header">
            <span>Files</span>
            <button
              className="ide-btn ide-btn-ghost ide-btn-icon"
              title="New file from template"
              aria-label="New file from template"
              onClick={() => setShowTemplateModal(true)}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="sidebar-content">
            {ide.files.length === 0 && (
              <div className="sidebar-empty">
                No files open. Create one or load from chain.
              </div>
            )}
            {ide.files.map((f) => (
              <div
                key={f.id}
                className={`file-item ${ide.activeFileId === f.id ? "active" : ""}`}
                onClick={() => ide.setActiveFileId(f.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    ide.setActiveFileId(f.id);
                  }
                }}
              >
                <span className="file-item-name">
                  <FileCode size={14} />
                  <span className="file-item-label">{f.name}</span>
                  {f.dirty && (
                    <span
                      className="dirty-dot"
                      title="Unsaved changes"
                      aria-label="Unsaved changes"
                    />
                  )}
                </span>
                <span
                  className="file-item-close"
                  role="button"
                  tabIndex={-1}
                  aria-label={`Close ${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    ide.closeFile(f.id);
                  }}
                >
                  <X size={12} />
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Query State */}
        <section className="sidebar-section">
          <div className="sidebar-header">Query State</div>
          <div className="sidebar-content">
            <div className="field-group">
              <input
                ref={stateKeyInputRef}
                className="ide-input ide-input-mono"
                placeholder="contract.variable:key"
                value={stateKey}
                onChange={(e) => setStateKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && stateKey.trim()) {
                    ide.queryState(stateKey.trim());
                  }
                }}
                aria-label="State key"
              />
              <button
                className="ide-btn ide-btn-secondary ide-btn-sm"
                disabled={!stateKey.trim()}
                onClick={() => ide.queryState(stateKey.trim())}
              >
                <Search size={11} /> Query
              </button>
            </div>
          </div>
        </section>

        {/* Load from chain */}
        <section className="sidebar-section">
          <div className="sidebar-header">Load from Chain</div>
          <div className="sidebar-content">
            <div className="field-group">
              <input
                ref={contractInputRef}
                className="ide-input ide-input-mono"
                placeholder="contract_name"
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && contractInput.trim()) {
                    ide.loadContractFromChain(contractInput.trim());
                    setContractInput("");
                  }
                }}
                aria-label="Contract name to load"
              />
              <div className="btn-row">
                <button
                  className="ide-btn ide-btn-secondary ide-btn-sm"
                  style={{ flex: 1 }}
                  disabled={!contractInput.trim()}
                  onClick={() => {
                    ide.loadContractFromChain(contractInput.trim());
                    setContractInput("");
                  }}
                >
                  <Code2 size={12} /> Source
                </button>
                <button
                  className="ide-btn ide-btn-secondary ide-btn-sm"
                  style={{ flex: 1 }}
                  disabled={!contractInput.trim()}
                  onClick={() => {
                    ide.loadContractMethods(contractInput.trim());
                    setBottomTab("interact");
                  }}
                >
                  <Braces size={12} /> Methods
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Lint & Deploy */}
        <section className="sidebar-section">
          <div className="sidebar-header">Lint & Deploy</div>
          <div className="sidebar-content">
            <div className="field-group">
              <button
                className="ide-btn ide-btn-secondary ide-btn-sm sidebar-action"
                disabled={!ide.activeFile || ide.linting}
                onClick={ide.lintCurrentFile}
                title={`Lint contract (${MOD}+Shift+L)`}
              >
                <span className="ide-btn-label">
                  <AlertTriangle size={12} />
                  {ide.linting ? "Linting..." : "Lint Contract"}
                </span>
                <span className="kbd">{MOD}⇧L</span>
              </button>
              {!ide.linterAvailable && (
                <div className="sidebar-hint">Linter offline (start local server)</div>
              )}
              <input
                className="ide-input ide-input-mono"
                placeholder="contract_name"
                value={deployName}
                onChange={(e) => setDeployName(e.target.value)}
                aria-label="Deploy contract name"
              />
              <button
                className="ide-btn ide-btn-primary ide-btn-sm sidebar-action"
                disabled={!ide.activeFile || !deployName.trim() || ide.deploying || !ide.walletConnected}
                onClick={() => {
                  if (ide.activeFile) {
                    ide.deployContract(deployName.trim(), ide.activeFile.code);
                  }
                }}
                title={`Deploy contract (${MOD}+Shift+D)`}
              >
                <span className="ide-btn-label">
                  <Upload size={12} />
                  {ide.deploying ? "Deploying..." : "Deploy Contract"}
                </span>
                <span className="kbd">{MOD}⇧D</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );

  // ── Editor area ─────────────────────────────────────────────

  const editorArea = (
    <div className="ide-main">
      <div className="editor-tabs" role="tablist" aria-label="Open files">
        {ide.files.map((f) => (
          <div
            key={f.id}
            role="tab"
            aria-selected={ide.activeFileId === f.id}
            className={`editor-tab ${ide.activeFileId === f.id ? "active" : ""}`}
            onClick={() => ide.setActiveFileId(f.id)}
          >
            {f.dirty && (
              <span
                className="dirty-dot"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
            {f.name}
            <span
              className="editor-tab-close"
              role="button"
              tabIndex={-1}
              aria-label={`Close ${f.name}`}
              onClick={(e) => { e.stopPropagation(); ide.closeFile(f.id); }}
            >
              <X size={11} />
            </span>
          </div>
        ))}
      </div>

      <div className="editor-area">
        {ide.activeFile ? (
          <Editor
            theme="xian-dark"
            language="python"
            value={ide.activeFile.code}
            beforeMount={handleEditorWillMount}
            onMount={handleEditorMount}
            onChange={(val) => {
              if (val !== undefined && ide.activeFileId) {
                ide.updateFileCode(ide.activeFileId, val);
              }
            }}
            options={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              lineNumbers: "on",
              renderLineHighlight: "line",
              bracketPairColorization: { enabled: true },
              tabSize: 4,
              insertSpaces: true,
              wordWrap: "on",
            }}
          />
        ) : (
          <div className="empty-state">
            <Code2 size={48} strokeWidth={1.2} />
            <h2>Xian IDE</h2>
            <p>Create a new contract from a template, or load an existing contract from the chain.</p>
            <div className="template-grid">
              {TEMPLATES.map((t) => (
                <div
                  key={t.id}
                  className="template-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => ide.createFile(`${t.id}.py`, t.code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ide.createFile(`${t.id}.py`, t.code);
                    }
                  }}
                >
                  <FileCode size={14} />
                  <span>{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Bottom panel ────────────────────────────────────────────

  const consoleContent = (
    <div className="bottom-content">
      {ide.console.length === 0 && (
        <div className="bottom-empty">No console output yet.</div>
      )}
      {ide.console.map((entry) => (
        <div key={entry.id} className="console-entry">
          <span className="console-time">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
          <span className={`console-msg ${entry.type}`}>{entry.message}</span>
          <button
            className="console-copy"
            title="Copy message"
            aria-label="Copy console message"
            onClick={() => {
              navigator.clipboard.writeText(entry.message);
              showToast("Copied to clipboard");
            }}
          >
            <Copy size={11} />
          </button>
        </div>
      ))}
      <div ref={consoleEndRef} />
    </div>
  );

  const interactContent = (
    <div className="bottom-content">
      {!ide.explorerContract ? (
        <div className="bottom-empty">
          Load a contract's methods from the sidebar to interact with it here.
        </div>
      ) : (
        <>
          <div className="interact-header">
            <div>
              <span className="interact-contract">{ide.explorerContract}</span>
              <span className="interact-counts">
                {ide.loadedMethods.length} methods · {ide.loadedVars.length} vars
              </span>
            </div>
            {!ide.walletConnected && (
              <span className="interact-warn">Connect wallet to call</span>
            )}
          </div>

          {ide.loadedMethods.length === 0 ? (
            <div className="bottom-empty">No exported methods.</div>
          ) : (
            ide.loadedMethods.map((m) => (
              <div key={m.name} className="method-card">
                <div className="method-name">{m.name}</div>
                {m.arguments.length > 0 && (
                  <div className="method-args">
                    {m.arguments.map((a) => (
                      <div key={a.name} className="method-arg-row">
                        <span className="method-arg-label" title={a.type}>
                          {a.name}
                          <span className="method-arg-type">: {a.type}</span>
                        </span>
                        <input
                          className="method-arg-input"
                          placeholder={a.type}
                          value={methodArgs[m.name]?.[a.name] ?? ""}
                          onChange={(e) => setMethodArg(m.name, a.name, e.target.value)}
                          aria-label={`${m.name} argument ${a.name}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="method-actions">
                  <button
                    className="ide-btn ide-btn-secondary ide-btn-sm"
                    disabled={!ide.walletConnected || ide.simulating || ide.executing}
                    onClick={() => {
                      const built = buildKwargs(m);
                      if (!built.ok) {
                        ide.log("error", built.message);
                        setBottomTab("console");
                        return;
                      }
                      ide.simulateCall(ide.explorerContract, m.name, built.kwargs);
                    }}
                  >
                    <Play size={11} /> {ide.simulating ? "Simulating..." : "Simulate"}
                  </button>
                  <button
                    className="ide-btn ide-btn-primary ide-btn-sm"
                    disabled={!ide.walletConnected || ide.simulating || ide.executing}
                    onClick={() => {
                      const built = buildKwargs(m);
                      if (!built.ok) {
                        ide.log("error", built.message);
                        setBottomTab("console");
                        return;
                      }
                      ide.executeFunction(ide.explorerContract, m.name, built.kwargs);
                    }}
                  >
                    <Send size={11} /> {ide.executing ? "Executing..." : "Execute"}
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );

  const bottomPanel = (
    <div
      className="ide-bottom"
      style={{ height: bottomHeight }}
      role="region"
      aria-label="Console and interaction panel"
    >
      <div
        className="resizer-h"
        onPointerDown={startBottomResize}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
      />
      <div className="bottom-tabs">
        <button
          className={`bottom-tab ${bottomTab === "console" ? "active" : ""}`}
          onClick={() => setBottomTab("console")}
          role="tab"
          aria-selected={bottomTab === "console"}
        >
          <Terminal size={12} /> Console
          {ide.console.length > 0 && <span className="tab-badge">{ide.console.length}</span>}
        </button>
        <button
          className={`bottom-tab ${bottomTab === "interact" ? "active" : ""}`}
          onClick={() => setBottomTab("interact")}
          role="tab"
          aria-selected={bottomTab === "interact"}
        >
          <Zap size={12} /> Interact
          {ide.loadedMethods.length > 0 && (
            <span className="tab-badge">{ide.loadedMethods.length}</span>
          )}
        </button>
        <div style={{ flex: 1 }} />
        {bottomTab === "console" && (
          <button
            className="ide-btn ide-btn-ghost ide-btn-sm"
            onClick={ide.clearConsole}
            disabled={ide.console.length === 0}
          >
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>
      {bottomTab === "console" ? consoleContent : interactContent}
    </div>
  );

  // ── Header ──────────────────────────────────────────────────

  const networkLabel = ide.networkUrl.replace(/^https?:\/\//, "").replace(/:\d+$/, "");

  return (
    <div className="ide-root">
      <header className="ide-header">
        <div className="ide-header-left">
          <button
            className="ide-btn ide-btn-ghost ide-btn-icon"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
          <span className="ide-brand">Xian IDE</span>
        </div>
        <div className="ide-header-right">
          <button
            className="ide-btn ide-btn-ghost ide-btn-sm"
            onClick={ensureEditorAndOpenPalette}
            title={`Command Palette (${MOD}+K)`}
            aria-label="Open command palette"
          >
            <Command size={14} /> Commands
            <span className="kbd">{MOD}K</span>
          </button>

          <button
            type="button"
            className="status-badge status-badge-button"
            onClick={openNetworkModal}
            title={`Network: ${ide.networkOnline ? "online" : "offline"} — ${ide.networkUrl}`}
            aria-label={`Network ${ide.networkOnline ? "online" : "offline"}, ${ide.networkUrl}. Click to change.`}
          >
            <span
              className={`status-dot ${ide.networkOnline ? "online" : "offline"}`}
              aria-hidden="true"
            />
            <span className="status-badge-label">{networkLabel}</span>
          </button>

          {ide.walletConnected ? (
            <button
              type="button"
              className="status-badge status-badge-button"
              onClick={ide.disconnectWallet}
              title="Click to disconnect wallet"
              aria-label={`Wallet ${ide.walletAccount}. Click to disconnect.`}
            >
              <Wallet size={12} />
              <span className="status-badge-label">
                {ide.walletAccount?.slice(0, 6)}...{ide.walletAccount?.slice(-4)}
              </span>
            </button>
          ) : (
            <button
              className="ide-btn ide-btn-primary ide-btn-sm"
              onClick={ide.connectWallet}
            >
              <Plug size={12} /> Connect Wallet
            </button>
          )}
        </div>
      </header>

      <div className="ide-body">
        {!sidebarCollapsed && sidebar}
        <div className="ide-content">
          {!sidebarCollapsed && (
            <div
              className="resizer-v"
              onPointerDown={startSidebarResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
          )}
          <div className="ide-content-top">
            {editorArea}
          </div>
          {bottomPanel}
        </div>
      </div>

      {/* Status bar */}
      <footer className="ide-statusbar" role="status" aria-live="polite">
        <div className="status-left">
          <span
            className={`status-dot ${ide.networkOnline ? "online" : "offline"}`}
            aria-hidden="true"
          />
          <span className="muted">{networkLabel}</span>
          <span className="status-sep">·</span>
          {ide.deploying ? (
            <span className="status-busy">Deploying…</span>
          ) : ide.linting ? (
            <span className="status-busy">Linting…</span>
          ) : ide.simulating ? (
            <span className="status-busy">Simulating…</span>
          ) : ide.executing ? (
            <span className="status-busy">Executing…</span>
          ) : (
            <span className="muted">Ready</span>
          )}
        </div>
        <div className="status-right">
          {ide.lintErrors.length > 0 && (
            <span className="status-errors" title="Lint errors">
              <AlertTriangle size={11} /> {ide.lintErrors.length}
            </span>
          )}
          {dirtyCount > 0 && (
            <span className="muted" title="Files with unsaved changes">
              {dirtyCount} unsaved
            </span>
          )}
          <span className="muted" title="Console entries">
            <MessageSquare size={11} /> {ide.console.length}
          </span>
        </div>
      </footer>

      {/* Network modal */}
      {showNetworkModal && (
        <div
          className="ide-modal-backdrop"
          onClick={() => setShowNetworkModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Network settings"
        >
          <div className="ide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ide-modal-header">
              <span className="ide-modal-title">Network</span>
              <button
                className="ide-btn ide-btn-ghost ide-btn-icon"
                onClick={() => setShowNetworkModal(false)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="ide-modal-body">
              <div className="field-group">
                <div className="field-label">Presets</div>
                <div className="btn-row">
                  {NETWORK_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      className={`ide-btn ide-btn-sm ${
                        networkInput === p.url ? "ide-btn-primary" : "ide-btn-secondary"
                      }`}
                      style={{ flex: 1 }}
                      onClick={() => setNetworkInput(p.url)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-group">
                <div className="field-label">RPC URL</div>
                <input
                  className="ide-input ide-input-mono"
                  value={networkInput}
                  onChange={(e) => setNetworkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      ide.changeNetwork(networkInput);
                      setShowNetworkModal(false);
                    }
                  }}
                  autoFocus
                  aria-label="RPC URL"
                />
                <button
                  className="ide-btn ide-btn-primary ide-btn-sm"
                  onClick={() => {
                    ide.changeNetwork(networkInput);
                    setShowNetworkModal(false);
                  }}
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template modal */}
      {showTemplateModal && (
        <div
          className="ide-modal-backdrop"
          onClick={() => setShowTemplateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="New file from template"
        >
          <div className="ide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ide-modal-header">
              <span className="ide-modal-title">New file from template</span>
              <button
                className="ide-btn ide-btn-ghost ide-btn-icon"
                onClick={() => setShowTemplateModal(false)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="ide-modal-body">
              <div className="template-grid template-grid-modal">
                {TEMPLATES.map((t) => (
                  <div
                    key={t.id}
                    className="template-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      ide.createFile(`${t.id}.py`, t.code);
                      setShowTemplateModal(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        ide.createFile(`${t.id}.py`, t.code);
                        setShowTemplateModal(false);
                      }
                    }}
                  >
                    <FileCode size={14} />
                    <span>{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div className="ide-toast-stack" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="ide-toast">{t.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
