import * as vscode from 'vscode';
import { AuthService } from './authService';
import { CompareService } from './compareService';
import { FabricClient } from './fabricClient';
import { normalizeJson } from './normalizer';
import { CompareTreeViewProvider } from './treeViewProvider';
import { ChangedItem } from './types';

const DOCUMENT_SCHEME = 'fabric-compare';

class DefinitionDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  setContent(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }
}

let treeProvider: CompareTreeViewProvider;
let documentProvider: DefinitionDocumentProvider;
let lastCompareContext:
  | {
      sourceWorkspaceId: string;
      targetWorkspaceId: string;
      bearerToken: string;
    }
  | undefined;

export function activate(context: vscode.ExtensionContext): void {
  treeProvider = new CompareTreeViewProvider();
  documentProvider = new DefinitionDocumentProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      DOCUMENT_SCHEME,
      documentProvider
    ),
    vscode.window.registerTreeDataProvider(
      'fabricCompareResults',
      treeProvider
    ),
    vscode.commands.registerCommand(
      'fabricCompare.compareWorkspaces',
      () => runCompareWorkspaces()
    ),
    vscode.commands.registerCommand(
      'fabricCompare.openDiff',
      (item?: ChangedItem) => openDiffForChangedItem(item)
    ),
    vscode.commands.registerCommand('fabricCompare.refresh', () =>
      rerunLastCompare()
    )
  );
}

export function deactivate(): void {}

async function runCompareWorkspaces(): Promise<void> {
  const sourceWorkspaceId = await promptWorkspaceId('Source');
  if (!sourceWorkspaceId) {
    return;
  }

  const targetWorkspaceId = await promptWorkspaceId('Target');
  if (!targetWorkspaceId) {
    return;
  }

  const authService = new AuthService();
  const bearerToken = await authService.getBearerToken();
  if (!bearerToken) {
    return;
  }

  lastCompareContext = { sourceWorkspaceId, targetWorkspaceId, bearerToken };

  await executeCompare(sourceWorkspaceId, targetWorkspaceId, bearerToken);
}

async function rerunLastCompare(): Promise<void> {
  if (!lastCompareContext) {
    vscode.window.showInformationMessage(
      'No previous comparison to refresh. Run "Fabric Compare: Compare Workspaces" first.'
    );
    return;
  }

  const { sourceWorkspaceId, targetWorkspaceId, bearerToken } =
    lastCompareContext;
  await executeCompare(sourceWorkspaceId, targetWorkspaceId, bearerToken);
}

async function executeCompare(
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  bearerToken: string
): Promise<void> {
  const client = new FabricClient({ bearerToken });
  const compareService = new CompareService(client);

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Comparing Fabric workspaces',
        cancellable: false,
      },
      (progress) =>
        compareService.compareWorkspaces(
          sourceWorkspaceId,
          targetWorkspaceId,
          progress
        )
    );

    treeProvider.setResult(result);
    vscode.commands.executeCommand('fabricCompareResults.focus');

    const summary = CompareService.formatSummary(result);
    vscode.window.showInformationMessage(`Comparison complete. ${summary}`);
  } catch (error) {
    CompareService.handleError(error);
  }
}

async function openDiffForChangedItem(item?: ChangedItem): Promise<void> {
  if (!item) {
    const result = treeProvider.getResult();
    if (!result?.changed.length) {
      vscode.window.showWarningMessage('No changed items to diff.');
      return;
    }
    item = result.changed[0];
  }

  if (item.definitionError) {
    vscode.window.showWarningMessage(
      `Cannot open diff: ${item.definitionError}`
    );
    return;
  }

  if (!item.sourceDefinition || !item.targetDefinition) {
    vscode.window.showWarningMessage(
      'Item definitions are missing for this comparison.'
    );
    return;
  }

  const safeName = encodeURIComponent(item.displayName);
  const sourceUri = vscode.Uri.parse(
    `${DOCUMENT_SCHEME}:source/${safeName}.json`
  );
  const targetUri = vscode.Uri.parse(
    `${DOCUMENT_SCHEME}:target/${safeName}.json`
  );

  documentProvider.setContent(
    sourceUri,
    normalizeJson(item.sourceDefinition)
  );
  documentProvider.setContent(
    targetUri,
    normalizeJson(item.targetDefinition)
  );

  const title = `${item.displayName} (Source ↔ Target)`;
  await vscode.commands.executeCommand(
    'vscode.diff',
    sourceUri,
    targetUri,
    title,
    { preview: false }
  );
}

async function promptWorkspaceId(role: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: `Fabric Compare — ${role} Workspace`,
    prompt: `Enter the ${role.toLowerCase()} workspace ID (GUID)`,
    ignoreFocusOut: true,
    validateInput: (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        return 'Workspace ID is required.';
      }
      if (
        !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          trimmed
        )
      ) {
        return 'Enter a valid GUID workspace ID.';
      }
      return undefined;
    },
  });

  return value?.trim();
}
