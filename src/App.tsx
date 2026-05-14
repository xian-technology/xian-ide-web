import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  Upload, Search, Plus, X, Trash2, Terminal, Code2,
  Wallet, FileCode, Plug, Braces, AlertTriangle, Command,
  Copy, Play, Send, Zap, MessageSquare, PanelLeftClose, PanelLeftOpen,
  Cloud, GripVertical,
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

type FileDropPlacement = "before" | "after";

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

function contractNameFromFileName(name: string): string {
  return name.replace(/\.s\.py$/i, "").replace(/\.py$/i, "").trim();
}

function normalizeDraftFileName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const base = contractNameFromFileName(trimmed);
  if (!base) return null;
  return `${base}.py`;
}

function getDropPlacement(e: React.DragEvent<HTMLElement>): FileDropPlacement {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

export default function App() {
  const ide = useIDE();
  const [bottomTab, setBottomTab] = useState<"console" | "interact">("console");
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [networkInput, setNetworkInput] = useState(ide.networkUrl);
  const [contractInput, setContractInput] = useState("");
  const [stateKey, setStateKey] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [methodArgs, setMethodArgs] = useState<Record<string, Record<string, string>>>({});
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState("");
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [dragOverFile, setDragOverFile] = useState<{
    id: string;
    placement: FileDropPlacement;
  } | null>(null);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const ideRef = useRef(ide);
  const diagnosticDecorationIdsRef = useRef<string[]>([]);
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

  // Apply compiler diagnostics as Monaco markers
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    const model = ed.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    const markers = ide.diagnostics.map((e) => ({
      severity: e.severity === "warning"
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Error,
      message: `[${e.code}] ${e.message}`,
      startLineNumber: e.line ?? 1,
      endLineNumber: e.endLine ?? e.line ?? 1,
      startColumn: e.col ?? 1,
      endColumn: e.endCol ?? (e.col ?? 1) + 1,
      source: "xian-compiler",
    }));
    monaco.editor.setModelMarkers(model, "xian-compiler", markers);

    const diagnosticLines = new Map<
      number,
      { severity: "error" | "warning"; messages: string[] }
    >();
    for (const error of ide.diagnostics) {
      if (!error.line) continue;
      const line = Math.max(1, Math.min(lineCount, error.line));
      const severity = error.severity === "warning" ? "warning" : "error";
      const current = diagnosticLines.get(line);
      const message = `[${error.code}] ${error.message}`;
      if (!current) {
        diagnosticLines.set(line, { severity, messages: [message] });
        continue;
      }
      current.messages.push(message);
      if (severity === "error") {
        current.severity = "error";
      }
    }

    diagnosticDecorationIdsRef.current = ed.deltaDecorations(
      diagnosticDecorationIdsRef.current,
      Array.from(diagnosticLines.entries()).map(([line, info]) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          glyphMarginClassName: `xian-diagnostic-glyph xian-diagnostic-glyph-${info.severity}`,
          glyphMarginHoverMessage: {
            value: info.messages.map((message) => `- ${message}`).join("\n"),
          },
        },
      }))
    );
  }, [ide.diagnostics, ide.activeFileId]);

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
          const file = i.activeFile;
          if (!file) { i.log("error", "No file open"); return; }
          if (file.fromChain) { i.log("error", "Loaded chain contracts are read-only"); return; }
          const name = contractNameFromFileName(file.name);
          if (!name) { i.log("error", "Rename the file before deploying"); return; }
          i.deployContract(name, file.code);
        },
      });

      editorInstance.addAction({
        id: "xian.check",
        label: "Xian: Check Contract",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
        run: () => { ideRef.current.checkCurrentFile(); },
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
  const activeContractName = useMemo(
    () => (ide.activeFile ? contractNameFromFileName(ide.activeFile.name) : ""),
    [ide.activeFile]
  );
  const activeFileFromChain = ide.activeFile?.fromChain === true;
  const activeChainContractName = activeFileFromChain ? ide.activeFile?.name ?? "" : "";
  const interactContractVisible = Boolean(
    activeChainContractName && ide.explorerContract === activeChainContractName
  );
  const interactMethods = interactContractVisible ? ide.loadedMethods : [];
  const interactVars = interactContractVisible ? ide.loadedVars : [];

  const canDeployActiveFile = Boolean(
    ide.activeFile &&
    !activeFileFromChain &&
    activeContractName &&
    !ide.deploying
  );

  const startFileRename = useCallback((file: { id: string; name: string; fromChain?: boolean }) => {
    if (file.fromChain) return;
    setEditingFileId(file.id);
    setEditingFileName(file.name);
  }, []);

  const cancelFileRename = useCallback(() => {
    setEditingFileId(null);
    setEditingFileName("");
  }, []);

  const commitFileRename = useCallback(() => {
    if (!editingFileId) return;
    const normalized = normalizeDraftFileName(editingFileName);
    if (normalized) {
      ide.renameFile(editingFileId, normalized);
    }
    setEditingFileId(null);
    setEditingFileName("");
  }, [editingFileId, editingFileName, ide]);

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
            {ide.files.map((f) => {
              const isEditing = editingFileId === f.id;
              const FileIcon = f.fromChain ? Cloud : FileCode;
              const dropClass =
                dragOverFile?.id === f.id ? `drop-${dragOverFile.placement}` : "";

              return (
                <div
                  key={f.id}
                  className={`file-item ${ide.activeFileId === f.id ? "active" : ""} ${
                    f.fromChain ? "file-item-chain" : "file-item-draft"
                  } ${draggingFileId === f.id ? "dragging" : ""} ${dropClass}`}
                  title={f.fromChain ? "Loaded from chain" : "Draft contract"}
                  onClick={() => ide.setActiveFileId(f.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    startFileRename(f);
                  }}
                  role="button"
                  tabIndex={0}
                  draggable={!isEditing}
                  onDragStart={(e) => {
                    setDraggingFileId(f.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", f.id);
                  }}
                  onDragOver={(e) => {
                    const sourceId = draggingFileId || e.dataTransfer.getData("text/plain");
                    if (!sourceId || sourceId === f.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverFile({ id: f.id, placement: getDropPlacement(e) });
                  }}
                  onDragLeave={() => {
                    setDragOverFile((current) => (current?.id === f.id ? null : current));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceId = draggingFileId || e.dataTransfer.getData("text/plain");
                    if (sourceId && sourceId !== f.id) {
                      ide.reorderFile(sourceId, f.id, getDropPlacement(e));
                    }
                    setDraggingFileId(null);
                    setDragOverFile(null);
                  }}
                  onDragEnd={() => {
                    setDraggingFileId(null);
                    setDragOverFile(null);
                  }}
                  onKeyDown={(e) => {
                    if (isEditing) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ide.setActiveFileId(f.id);
                    }
                  }}
                >
                  <span className="file-drag-handle" aria-hidden="true">
                    <GripVertical size={12} />
                  </span>
                  <span className="file-item-name">
                    <FileIcon
                      size={14}
                      className="file-origin-icon"
                      aria-hidden="true"
                    />
                    {isEditing ? (
                      <input
                        className="file-rename-input"
                        value={editingFileName}
                        onChange={(e) => setEditingFileName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitFileRename();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelFileRename();
                          }
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={commitFileRename}
                        autoFocus
                        aria-label={`Rename ${f.name}`}
                      />
                    ) : (
                      <span className="file-item-label" title={f.name}>
                        {f.name}
                      </span>
                    )}
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
              );
            })}
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

        {/* Check Contract */}
        <section className="sidebar-section">
          <div className="sidebar-header">Check Contract</div>
          <div className="sidebar-content">
            <div className="field-group">
              <button
                className="ide-btn ide-btn-secondary ide-btn-sm sidebar-action"
                disabled={!ide.activeFile || ide.checking}
                onClick={ide.checkCurrentFile}
                title={`Check contract (${MOD}+Shift+L)`}
              >
                <span className="ide-btn-label">
                  <AlertTriangle size={12} />
                  {ide.checking ? "Checking..." : "Check Contract"}
                </span>
                <span className="kbd">{MOD}⇧L</span>
              </button>
            </div>
          </div>
        </section>

        {/* Deploy Contract */}
        <section className="sidebar-section">
          <div className="sidebar-header">Deploy Contract</div>
          <div className="sidebar-content">
            <div className="field-group">
              <input
                className="ide-input ide-input-mono"
                placeholder="contract_name"
                value={activeContractName}
                readOnly
                aria-label="Deploy contract name from file name"
              />
              <button
                className="ide-btn ide-btn-primary ide-btn-sm sidebar-action"
                disabled={!canDeployActiveFile}
                onClick={() => {
                  if (ide.activeFile && !activeFileFromChain) {
                    ide.deployContract(activeContractName, ide.activeFile.code);
                  }
                }}
                title={
                  activeFileFromChain
                    ? "Loaded chain contracts are read-only"
                    : `Compile and deploy contract (${MOD}+Shift+D)`
                }
              >
                <span className="ide-btn-label">
                  {activeFileFromChain ? <Cloud size={12} /> : <Upload size={12} />}
                  {activeFileFromChain
                    ? "Loaded from Chain"
                    : ide.deploying
                      ? "Deploying..."
                      : "Deploy Contract"}
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
            className={`editor-tab ${ide.activeFileId === f.id ? "active" : ""} ${
              f.fromChain ? "editor-tab-chain" : "editor-tab-draft"
            }`}
            title={f.fromChain ? "Loaded from chain" : "Draft contract"}
            onClick={() => ide.setActiveFileId(f.id)}
          >
            {f.fromChain ? (
              <Cloud size={12} aria-hidden="true" />
            ) : (
              <FileCode size={12} aria-hidden="true" />
            )}
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
              readOnly: ide.activeFile.fromChain === true,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              glyphMargin: true,
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
      {interactContractVisible && (
        <>
          <div className="interact-header">
            <div>
              <span className="interact-contract">{activeChainContractName}</span>
              <span className="interact-counts">
                {interactMethods.length} methods · {interactVars.length} vars
              </span>
            </div>
            {!ide.walletConnected && (
              <span className="interact-warn">Connect wallet to call</span>
            )}
          </div>

          {interactMethods.length === 0 ? (
            <div className="bottom-empty">No exported methods.</div>
          ) : (
            interactMethods.map((m) => (
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
                      ide.simulateCall(activeChainContractName, m.name, built.kwargs);
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
                      ide.executeFunction(activeChainContractName, m.name, built.kwargs);
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
          {interactMethods.length > 0 && (
            <span className="tab-badge">{interactMethods.length}</span>
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
          ) : ide.checking ? (
            <span className="status-busy">Checking…</span>
          ) : ide.simulating ? (
            <span className="status-busy">Simulating…</span>
          ) : ide.executing ? (
            <span className="status-busy">Executing…</span>
          ) : (
            <span className="muted">Ready</span>
          )}
        </div>
        <div className="status-right">
          {ide.diagnostics.length > 0 && (
            <span className="status-errors" title="Compiler diagnostics">
              <AlertTriangle size={11} /> {ide.diagnostics.length}
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
