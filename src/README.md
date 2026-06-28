# src

## Purpose

This folder contains the browser IDE application: the Monaco-based editor
shell plus the integration layer for compiling, deploying, and calling
contracts.

## Contents

- `App.tsx`, `main.tsx` — root component (IDE layout, panels, terminal UI)
  and the Vite entrypoint.
- `hooks/useIDE.ts` — the central IDE state hook: files, diagnostics,
  deploy / call flows, and wallet state.
- `lib/` — integration layer:
  - `compiler.ts`, `compiler-client.ts` — WASM compiler loading and
    diagnostics.
  - `deployment.ts` — source-backed `submission.submit_contract` payloads.
  - `wallet.ts` — injected-provider connection and transaction flow.
  - `xian-client.ts` — `@xian-tech/client` setup for reads and simulation.
  - `contract-templates.ts` — starter contract templates.
- `styles/ide.css` — IDE styling and Monaco theme glue.
- `assets/` — static images.

## Notes

- `deployment.ts` encodes the source-only deployment contract; compiler
  integration remains for diagnostics and artifact inspection.

## Next

- Start with `hooks/useIDE.ts` to see how the pieces connect.
