import { useState, useRef, useEffect, useCallback } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  Upload, Search, Plus, X, Trash2, Terminal, Code2,
  Wallet, FileCode, Plug, Braces, AlertTriangle
} from "lucide-react";
import { useIDE } from "./hooks/useIDE";

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
import { TEMPLATES } from "./lib/contract-templates";
import "./styles/ide.css";

export default function App() {
  const ide = useIDE();
  const [bottomTab, setBottomTab] = useState<"console" | "interact">("console");
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [networkInput, setNetworkInput] = useState(ide.networkUrl);
  const [contractInput, setContractInput] = useState("");
  const [deployName, setDeployName] = useState("");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const ideRef = useRef(ide);
  ideRef.current = ide;
  const deployNameRef = useRef(deployName);
  deployNameRef.current = deployName;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    // Ensure Cmd+Shift+P opens the command palette
    editorInstance.addAction({
      id: "xian.commandPalette",
      label: "Open Command Palette",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP],
      run: (ed) => { ed.trigger("keyboard", "editor.action.quickCommand", null); },
    });

    // Register custom Xian commands in the command palette
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
        const name = prompt("Contract name:");
        if (name?.trim()) ideRef.current.loadContractFromChain(name.trim());
      },
    });

    editorInstance.addAction({
      id: "xian.queryState",
      label: "Xian: Query State",
      run: () => {
        const key = prompt("State key (contract.variable:key):");
        if (key?.trim()) ideRef.current.queryState(key.trim());
      },
    });
  }, []);

  // Auto-scroll console
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ide.console]);

  // ── Sidebar ─────────────────────────────────────────────────

  const sidebar = (
    <div className="ide-sidebar">
      {/* Files */}
      <div className="sidebar-section" style={{ flex: 1, overflow: "auto" }}>
        <div className="sidebar-header">
          <span>Files</span>
          <button
            className="ide-btn ide-btn-ghost ide-btn-icon"
            title="New file from template"
            onClick={() => setShowTemplateMenu((v) => !v)}
          >
            <Plus size={14} />
          </button>
        </div>
        {showTemplateMenu && (
          <div style={{ padding: "0 8px 8px" }}>
            {TEMPLATES.map((t) => (
              <div
                key={t.id}
                className="file-item"
                onClick={() => {
                  ide.createFile(`${t.id}.py`, t.code);
                  setShowTemplateMenu(false);
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FileCode size={14} />
                  {t.name}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="sidebar-content">
          {ide.files.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 12, padding: "8px 4px" }}>
              No files open. Create one or load from chain.
            </div>
          )}
          {ide.files.map((f) => (
            <div
              key={f.id}
              className={`file-item ${ide.activeFileId === f.id ? "active" : ""}`}
              onClick={() => ide.setActiveFileId(f.id)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <FileCode size={14} />
                {f.name}
                {f.dirty && <span className="dirty-dot" />}
              </span>
              <span className="file-item-close" onClick={(e) => { e.stopPropagation(); ide.closeFile(f.id); }}>
                <X size={12} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Query State */}
      <div className="sidebar-section">
        <div className="sidebar-header">Query State</div>
        <div className="sidebar-content">
          <StateQuery onQuery={ide.queryState} />
        </div>
      </div>

      {/* Load from chain */}
      <div className="sidebar-section">
        <div className="sidebar-header">Load from Chain</div>
        <div className="sidebar-content">
          <div className="field-group">
            <input
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
                onClick={() => ide.loadContractMethods(contractInput.trim())}
              >
                <Braces size={12} /> Methods
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lint & Deploy */}
      <div className="sidebar-section">
        <div className="sidebar-header">Lint & Deploy</div>
        <div className="sidebar-content">
          <div className="field-group">
            <button
              className="ide-btn ide-btn-secondary ide-btn-sm"
              disabled={!ide.activeFile || ide.linting}
              onClick={ide.lintCurrentFile}
              style={{ width: "100%" }}
            >
              <AlertTriangle size={12} />
              {ide.linting ? "Linting..." : "Lint Contract"}
              {!ide.linterAvailable && <span style={{ fontSize: 10, opacity: 0.6 }}>(offline)</span>}
            </button>
            <input
              className="ide-input ide-input-mono"
              placeholder="contract_name"
              value={deployName}
              onChange={(e) => setDeployName(e.target.value)}
            />
            <button
              className="ide-btn ide-btn-primary ide-btn-sm"
              disabled={!ide.activeFile || !deployName.trim() || ide.deploying || !ide.walletConnected}
              onClick={() => {
                if (ide.activeFile) {
                  ide.deployContract(deployName.trim(), ide.activeFile.code);
                }
              }}
            >
              <Upload size={12} />
              {ide.deploying ? "Deploying..." : "Deploy Contract"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Editor area ─────────────────────────────────────────────

  const editorArea = (
    <div className="ide-main">
      {/* Tabs */}
      <div className="editor-tabs">
        {ide.files.map((f) => (
          <div
            key={f.id}
            className={`editor-tab ${ide.activeFileId === f.id ? "active" : ""}`}
            onClick={() => ide.setActiveFileId(f.id)}
          >
            {f.dirty && <span className="dirty-dot" />}
            {f.name}
            <span
              style={{ cursor: "pointer", opacity: 0.5, marginLeft: 4 }}
              onClick={(e) => { e.stopPropagation(); ide.closeFile(f.id); }}
            >
              <X size={11} />
            </span>
          </div>
        ))}
      </div>

      {/* Editor */}
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
            <h2>Xian Contract IDE</h2>
            <p>Create a new contract from a template, or load an existing contract from the chain.</p>
            <div className="template-grid">
              {TEMPLATES.map((t) => (
                <div
                  key={t.id}
                  className="template-card"
                  onClick={() => ide.createFile(`${t.id}.py`, t.code)}
                >
                  {t.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );


  // ── Bottom panel ────────────────────────────────────────────

  const bottomPanel = (
    <div className="ide-bottom">
      <div className="bottom-tabs">
        <div
          className={`bottom-tab ${bottomTab === "console" ? "active" : ""}`}
          onClick={() => setBottomTab("console")}
        >
          <Terminal size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
          Console
        </div>
        <div style={{ flex: 1 }} />
        <button className="ide-btn ide-btn-ghost ide-btn-sm" onClick={ide.clearConsole}>
          <Trash2 size={11} /> Clear
        </button>
      </div>
      <div className="bottom-content">
        {ide.console.map((entry) => (
          <div
            key={entry.id}
            className="console-entry"
            style={{ cursor: "pointer" }}
            title="Click to copy"
            onClick={() => {
              navigator.clipboard.writeText(entry.message);
              showToast("Copied to clipboard");
            }}
          >
            <span className="console-time">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            <span className={`console-msg ${entry.type}`}>{entry.message}</span>
          </div>
        ))}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );

  // ── Header ──────────────────────────────────────────────────

  return (
    <div className="ide-root">
      <header className="ide-header">
        <div className="ide-header-left">
          <span className="ide-brand">Xian IDE</span>
        </div>
        <div className="ide-header-right">
          {/* Network */}
          <div
            className="status-badge"
            style={{ cursor: "pointer" }}
            onClick={() => setShowNetworkModal(!showNetworkModal)}
          >
            <span className={`status-dot ${ide.networkOnline ? "online" : "offline"}`} />
            {ide.networkUrl.replace(/^https?:\/\//, "").replace(/:\d+$/, "")}
          </div>

          {/* Wallet */}
          {ide.walletConnected ? (
            <div className="status-badge" style={{ cursor: "pointer" }} onClick={ide.disconnectWallet}>
              <Wallet size={12} />
              {ide.walletAccount?.slice(0, 6)}...{ide.walletAccount?.slice(-4)}
            </div>
          ) : (
            <button className="ide-btn ide-btn-primary ide-btn-sm" onClick={ide.connectWallet}>
              <Plug size={12} /> Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Network modal */}
      {showNetworkModal && (
        <div style={{
          position: "absolute", top: 48, right: 16, zIndex: 100,
          background: "var(--bg-2)", border: "1px solid var(--line)",
          borderRadius: 8, padding: 12, width: 300, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
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
            />
            <button
              className="ide-btn ide-btn-primary ide-btn-sm"
              onClick={() => { ide.changeNetwork(networkInput); setShowNetworkModal(false); }}
            >
              Connect
            </button>
          </div>
        </div>
      )}

      <div className="ide-body">
        {sidebar}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {editorArea}
          </div>
          {bottomPanel}
        </div>
      </div>
      {toast && <div className="ide-toast">{toast}</div>}
    </div>
  );
}

// ── State Query Component ─────────────────────────────────────

function StateQuery({ onQuery }: { onQuery: (key: string) => Promise<unknown> }) {
  const [key, setKey] = useState("");

  return (
    <div className="field-group">
      <input
        className="ide-input ide-input-mono"
        placeholder="contract.variable:key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && key.trim()) {
            onQuery(key.trim());
          }
        }}
      />
      <button
        className="ide-btn ide-btn-secondary ide-btn-sm"
        disabled={!key.trim()}
        onClick={() => onQuery(key.trim())}
      >
        <Search size={11} /> Query
      </button>
    </div>
  );
}
