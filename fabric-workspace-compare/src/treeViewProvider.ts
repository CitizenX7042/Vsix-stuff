import * as vscode from 'vscode';
import {
  ChangedItem,
  CompareCategory,
  CompareResult,
  MatchedItem,
} from './types';

export class CompareTreeItem extends vscode.TreeItem {
  constructor(
    public readonly category: CompareCategory | 'root',
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly matchedItem?: MatchedItem | ChangedItem,
    public readonly changedItem?: ChangedItem
  ) {
    super(label, collapsibleState);

    if (category === 'changed' && changedItem) {
      this.contextValue = 'changedItem';
      this.command = {
        command: 'fabricCompare.openDiff',
        title: 'Open Diff',
        arguments: [changedItem],
      };
      this.iconPath = new vscode.ThemeIcon('diff');
      if (changedItem.definitionError) {
        this.description = 'definition unavailable';
        this.tooltip = changedItem.definitionError;
      }
    } else if (category === 'onlyInSource') {
      this.iconPath = new vscode.ThemeIcon('arrow-left');
    } else if (category === 'onlyInTarget') {
      this.iconPath = new vscode.ThemeIcon('arrow-right');
    } else if (category === 'same') {
      this.iconPath = new vscode.ThemeIcon('check');
    } else if (category === 'unsupported') {
      this.iconPath = new vscode.ThemeIcon('warning');
    }
  }
}

export class CompareTreeViewProvider
  implements vscode.TreeDataProvider<CompareTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    CompareTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private result: CompareResult | undefined;

  setResult(result: CompareResult | undefined): void {
    this.result = result;
    this.refresh();
  }

  getResult(): CompareResult | undefined {
    return this.result;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: CompareTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CompareTreeItem): CompareTreeItem[] {
    if (!this.result) {
      return [
        new CompareTreeItem(
          'root',
          'Run "Fabric Compare: Compare Workspaces" to begin',
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }

    if (!element) {
      return this.buildRootNodes();
    }

    return this.buildCategoryChildren(element.category as CompareCategory);
  }

  private buildRootNodes(): CompareTreeItem[] {
    const r = this.result!;
    return [
      this.categoryNode(
        'onlyInSource',
        `Only in Source (${r.onlyInSource.length})`,
        r.onlyInSource.length
      ),
      this.categoryNode(
        'onlyInTarget',
        `Only in Target (${r.onlyInTarget.length})`,
        r.onlyInTarget.length
      ),
      this.categoryNode(
        'changed',
        `Changed (${r.changed.length})`,
        r.changed.length
      ),
      this.categoryNode('same', `Same (${r.same.length})`, r.same.length),
      this.categoryNode(
        'unsupported',
        `Unsupported Types (${r.unsupportedInSource.length + r.unsupportedInTarget.length + r.unsupportedInBoth.length})`,
        r.unsupportedInSource.length +
          r.unsupportedInTarget.length +
          r.unsupportedInBoth.length
      ),
    ];
  }

  private categoryNode(
    category: CompareCategory,
    label: string,
    count: number
  ): CompareTreeItem {
    return new CompareTreeItem(
      category,
      label,
      count > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
  }

  private buildCategoryChildren(category: CompareCategory): CompareTreeItem[] {
    const r = this.result!;

    switch (category) {
      case 'onlyInSource':
        return r.onlyInSource.map((item) => this.leafNode('onlyInSource', item));
      case 'onlyInTarget':
        return r.onlyInTarget.map((item) => this.leafNode('onlyInTarget', item));
      case 'changed':
        return r.changed.map(
          (item) =>
            new CompareTreeItem(
              'changed',
              `${item.displayName} (${item.type})`,
              vscode.TreeItemCollapsibleState.None,
              item,
              item
            )
        );
      case 'same':
        return r.same.map((item) => this.leafNode('same', item));
      case 'unsupported':
        return [
          ...r.unsupportedInSource.map((item) =>
            this.leafNode('unsupported', item, 'source only')
          ),
          ...r.unsupportedInTarget.map((item) =>
            this.leafNode('unsupported', item, 'target only')
          ),
          ...r.unsupportedInBoth.map((item) =>
            this.leafNode('unsupported', item, 'both')
          ),
        ];
      default:
        return [];
    }
  }

  private leafNode(
    category: CompareCategory,
    item: MatchedItem,
    suffix?: string
  ): CompareTreeItem {
    const label = suffix
      ? `${item.displayName} (${item.type}) — ${suffix}`
      : `${item.displayName} (${item.type})`;
    return new CompareTreeItem(
      category,
      label,
      vscode.TreeItemCollapsibleState.None,
      item
    );
  }
}
