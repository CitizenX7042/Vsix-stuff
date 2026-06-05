/** Supported Fabric item types for comparison in MVP. */
export const SUPPORTED_ITEM_TYPES = ['Notebook', 'DataPipeline'] as const;

export type SupportedItemType = (typeof SUPPORTED_ITEM_TYPES)[number];

export interface FabricItem {
  id: string;
  type: string;
  displayName: string;
  description?: string;
  workspaceId: string;
}

export interface FabricItemsResponse {
  value: FabricItem[];
  continuationToken?: string;
}

export interface ItemDefinitionPart {
  path: string;
  payload: string;
  payloadType: string;
}

export interface ItemDefinitionResponse {
  parts: ItemDefinitionPart[];
}

export interface MatchedItem {
  displayName: string;
  type: string;
  sourceItem?: FabricItem;
  targetItem?: FabricItem;
}

export interface ChangedItem extends MatchedItem {
  sourceItem: FabricItem;
  targetItem: FabricItem;
  sourceDefinition?: string;
  targetDefinition?: string;
  definitionError?: string;
}

export interface CompareResult {
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  onlyInSource: MatchedItem[];
  onlyInTarget: MatchedItem[];
  changed: ChangedItem[];
  same: MatchedItem[];
  unsupportedInSource: MatchedItem[];
  unsupportedInTarget: MatchedItem[];
  unsupportedInBoth: MatchedItem[];
}

export type CompareCategory =
  | 'onlyInSource'
  | 'onlyInTarget'
  | 'changed'
  | 'same'
  | 'unsupported';

export class FabricApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'FabricApiError';
  }
}

export class UnsupportedItemTypeError extends Error {
  constructor(public readonly itemType: string) {
    super(`Item type "${itemType}" is not supported for definition export.`);
    this.name = 'UnsupportedItemTypeError';
  }
}

export class MissingDefinitionError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly itemId: string,
    message?: string
  ) {
    super(message ?? `No definition returned for item ${itemId} in workspace ${workspaceId}.`);
    this.name = 'MissingDefinitionError';
  }
}
