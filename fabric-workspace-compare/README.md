# Fabric Workspace Compare

A read-only Visual Studio Code extension that compares Microsoft Fabric workspace items between two workspaces. The MVP focuses on **Notebooks** and **Data Pipelines**.

## Features

- **Command:** `Fabric Compare: Compare Workspaces`
- Prompts for source workspace ID, target workspace ID, and bearer token
- Lists items from both workspaces via the [Microsoft Fabric REST API](https://learn.microsoft.com/en-us/rest/api/fabric/articles/)
- Matches items by `displayName` and `type`
- Shows results in the **Fabric Compare** tree view:
  - Only in source
  - Only in target
  - Exists in both but changed
  - Same
  - Unsupported item types (not yet comparable)
- For changed items with definitions: opens a VS Code diff editor with normalized JSON

## Project Structure

```
fabric-workspace-compare/
├── src/
│   ├── extension.ts        # Activation, commands, diff editor wiring
│   ├── authService.ts      # Placeholder token prompt (TODO: MSAL)
│   ├── fabricClient.ts     # Read-only Fabric REST API client
│   ├── compareService.ts   # Workspace comparison logic
│   ├── normalizer.ts       # JSON normalization for stable diffs
│   ├── treeViewProvider.ts # Comparison results tree view
│   └── types.ts            # Shared types and errors
├── package.json
├── tsconfig.json
└── .vscode/
    ├── launch.json         # F5 debug configuration
    └── tasks.json          # TypeScript watch build task
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Visual Studio Code](https://code.visualstudio.com/) 1.85+

## Setup

```bash
cd fabric-workspace-compare
npm install
npm run compile
```

## Build a VSIX

The installable extension artifact is a `.vsix` file. Build it with:

```bash
cd fabric-workspace-compare
npm install
npm run package
```

This compiles TypeScript and runs [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce) to produce:

```
fabric-workspace-compare/fabric-workspace-compare-0.1.0.vsix
```

Install the VSIX in VS Code:

- **Command Palette** → `Extensions: Install from VSIX...` → select the `.vsix` file
- Or from a terminal: `code --install-extension fabric-workspace-compare-0.1.0.vsix`

> Update the `publisher` field in `package.json` before publishing to the Marketplace. For local/private use, any publisher name works.

## Run / Debug with F5

1. Open the `fabric-workspace-compare` folder in VS Code.
2. Press **F5** (or choose **Run > Start Debugging**).
3. A new **Extension Development Host** window opens with the extension loaded.
4. In the Extension Development Host:
   - Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run **Fabric Compare: Compare Workspaces**
   - Enter source and target workspace GUIDs
   - Paste a valid Fabric API bearer token when prompted
5. View results in the **Fabric Compare** panel under the Explorer sidebar.
6. Click a **Changed** item to open the diff editor.

### Getting a Bearer Token (development)

Authentication is a placeholder input box. For development you can obtain a token via:

- Azure CLI: `az account get-access-token --resource https://api.fabric.microsoft.com`
- Or your organization's preferred method for Fabric API access

> **TODO:** Replace `authService.ts` with MSAL-based authentication for production use.

## Supported Item Types

| Type           | List | Definition export | Compare |
|----------------|------|-------------------|---------|
| Notebook       | Yes  | Yes               | Yes     |
| DataPipeline   | Yes  | Yes               | Yes     |
| Other types    | Yes  | No                | Listed as unsupported |

## Error Handling

The extension handles:

- **401 / 403** — Invalid or insufficient permissions
- **429** — API throttling with exponential backoff retries
- **Missing definitions** — Shown in tree view with tooltip; diff not available
- **Unsupported item types** — Listed separately, not compared

## Future Work (TODOs in code)

- [ ] MSAL authentication (`@azure/msal-node`)
- [ ] Write operations: deploy, import, update, delete
- [ ] Additional item types (Lakehouse, SemanticModel, etc.)
- [ ] Workspace picker UI instead of raw GUID input
- [ ] Persist last-used workspace IDs in extension storage

## API Reference

Read-only endpoints used:

- `GET /v1/workspaces/{workspaceId}/items` — List workspace items
- `POST /v1/workspaces/{workspaceId}/items/{itemId}/getDefinition` — Export item definition

Base URL: `https://api.fabric.microsoft.com/v1`

## License

MIT
