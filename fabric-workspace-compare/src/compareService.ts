import * as vscode from 'vscode';
import { FabricClient } from './fabricClient';
import { definitionsAreEqual } from './normalizer';
import {
  ChangedItem,
  CompareResult,
  FabricApiError,
  FabricItem,
  MatchedItem,
  MissingDefinitionError,
  SUPPORTED_ITEM_TYPES,
  UnsupportedItemTypeError,
} from './types';

function itemKey(item: Pick<FabricItem, 'displayName' | 'type'>): string {
  return `${item.type}::${item.displayName}`;
}

/**
 * Compares Fabric workspace items between a source and target workspace.
 * All API access is read-only.
 */
export class CompareService {
  constructor(private readonly client: FabricClient) {}

  async compareWorkspaces(
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<CompareResult> {
    progress.report({ message: 'Listing source workspace items...' });
    const sourceItems = await this.client.listWorkspaceItems(sourceWorkspaceId);

    progress.report({ message: 'Listing target workspace items...' });
    const targetItems = await this.client.listWorkspaceItems(targetWorkspaceId);

    const sourceMap = this.buildItemMap(sourceItems);
    const targetMap = this.buildItemMap(targetItems);

    const result: CompareResult = {
      sourceWorkspaceId,
      targetWorkspaceId,
      onlyInSource: [],
      onlyInTarget: [],
      changed: [],
      same: [],
      unsupportedInSource: [],
      unsupportedInTarget: [],
      unsupportedInBoth: [],
    };

    const allKeys = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    const comparableKeys = [...allKeys].filter((key) => {
      const source = sourceMap.get(key);
      const target = targetMap.get(key);
      const type = source?.type ?? target?.type ?? '';
      return this.isComparableType(type);
    });

    const total = comparableKeys.length || 1;
    let processed = 0;

    for (const key of allKeys) {
      const source = sourceMap.get(key);
      const target = targetMap.get(key);
      const type = source?.type ?? target?.type ?? '';

      if (!this.isComparableType(type)) {
        const entry: MatchedItem = {
          displayName: source?.displayName ?? target!.displayName,
          type,
          sourceItem: source,
          targetItem: target,
        };
        if (source && target) {
          result.unsupportedInBoth.push(entry);
        } else if (source) {
          result.unsupportedInSource.push(entry);
        } else if (target) {
          result.unsupportedInTarget.push(entry);
        }
        continue;
      }

      if (source && !target) {
        result.onlyInSource.push(this.toMatchedItem(source, target));
        continue;
      }

      if (!source && target) {
        result.onlyInTarget.push(this.toMatchedItem(source, target));
        continue;
      }

      processed++;
      progress.report({
        message: `Comparing ${source!.displayName} (${processed}/${comparableKeys.length})...`,
        increment: 100 / total,
      });

      const changedItem = await this.compareMatchedPair(source!, target!);
      if (changedItem) {
        result.changed.push(changedItem);
      } else {
        result.same.push(this.toMatchedItem(source!, target!));
      }
    }

    return result;
  }

  private buildItemMap(items: FabricItem[]): Map<string, FabricItem> {
    const map = new Map<string, FabricItem>();
    for (const item of items) {
      map.set(itemKey(item), item);
    }
    return map;
  }

  private isComparableType(type: string): boolean {
    return (SUPPORTED_ITEM_TYPES as readonly string[]).includes(type);
  }

  private toMatchedItem(
    source?: FabricItem,
    target?: FabricItem
  ): MatchedItem {
    return {
      displayName: source?.displayName ?? target!.displayName,
      type: source?.type ?? target!.type,
      sourceItem: source,
      targetItem: target,
    };
  }

  private async compareMatchedPair(
    source: FabricItem,
    target: FabricItem
  ): Promise<ChangedItem | null> {
    try {
      const [sourceDefinition, targetDefinition] = await Promise.all([
        this.client.getItemDefinition(
          source.workspaceId,
          source.id,
          source.type
        ),
        this.client.getItemDefinition(
          target.workspaceId,
          target.id,
          target.type
        ),
      ]);

      if (definitionsAreEqual(sourceDefinition, targetDefinition)) {
        return null;
      }

      return {
        displayName: source.displayName,
        type: source.type,
        sourceItem: source,
        targetItem: target,
        sourceDefinition,
        targetDefinition,
      };
    } catch (error) {
      if (
        error instanceof UnsupportedItemTypeError ||
        error instanceof MissingDefinitionError
      ) {
        return {
          displayName: source.displayName,
          type: source.type,
          sourceItem: source,
          targetItem: target,
          definitionError: error.message,
        };
      }
      throw error;
    }
  }

  static formatSummary(result: CompareResult): string {
    return [
      `Only in source: ${result.onlyInSource.length}`,
      `Only in target: ${result.onlyInTarget.length}`,
      `Changed: ${result.changed.length}`,
      `Same: ${result.same.length}`,
      `Unsupported: ${result.unsupportedInSource.length + result.unsupportedInTarget.length + result.unsupportedInBoth.length}`,
    ].join(' | ');
  }

  static handleError(error: unknown): void {
    if (error instanceof FabricApiError) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        vscode.window.showErrorMessage(error.message);
        return;
      }
      if (error.statusCode === 429) {
        const retryHint = error.retryAfterSeconds
          ? ` Retry after ${error.retryAfterSeconds}s.`
          : '';
        vscode.window.showErrorMessage(`${error.message}${retryHint}`);
        return;
      }
    }

    const message =
      error instanceof Error ? error.message : 'An unknown error occurred.';
    vscode.window.showErrorMessage(`Fabric compare failed: ${message}`);
  }
}
