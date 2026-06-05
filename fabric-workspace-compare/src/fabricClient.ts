import {
  FabricApiError,
  FabricItem,
  FabricItemsResponse,
  ItemDefinitionResponse,
  MissingDefinitionError,
  SUPPORTED_ITEM_TYPES,
  SupportedItemType,
  UnsupportedItemTypeError,
} from './types';

const FABRIC_API_BASE = 'https://api.fabric.microsoft.com/v1';

export interface FabricClientOptions {
  bearerToken: string;
  /** Max retries for 429 throttling. */
  maxRetries?: number;
}

/**
 * Read-only client for the Microsoft Fabric REST API.
 *
 * TODO: Add write operations (create, update, import, delete) behind explicit
 * user confirmation once MSAL auth and deployment workflows are implemented.
 */
export class FabricClient {
  private readonly maxRetries: number;

  constructor(private readonly options: FabricClientOptions) {
    this.maxRetries = options.maxRetries ?? 3;
  }

  async listWorkspaceItems(workspaceId: string): Promise<FabricItem[]> {
    const items: FabricItem[] = [];
    let continuationToken: string | undefined;

    do {
      const query = continuationToken
        ? `?continuationToken=${encodeURIComponent(continuationToken)}`
        : '';
      const response = await this.request<FabricItemsResponse>(
        `/workspaces/${workspaceId}/items${query}`
      );
      items.push(...response.value);
      continuationToken = response.continuationToken;
    } while (continuationToken);

    return items;
  }

  async getItemDefinition(
    workspaceId: string,
    itemId: string,
    itemType: string
  ): Promise<string> {
    if (!this.isSupportedType(itemType)) {
      throw new UnsupportedItemTypeError(itemType);
    }

    const response = await this.request<ItemDefinitionResponse>(
      `/workspaces/${workspaceId}/items/${itemId}/getDefinition`,
      { method: 'POST' }
    );

    if (!response.parts?.length) {
      throw new MissingDefinitionError(workspaceId, itemId);
    }

    return this.combineDefinitionParts(response.parts);
  }

  isSupportedType(itemType: string): itemType is SupportedItemType {
    return (SUPPORTED_ITEM_TYPES as readonly string[]).includes(itemType);
  }

  private combineDefinitionParts(
    parts: ItemDefinitionResponse['parts']
  ): string {
    if (parts.length === 1) {
      return parts[0].payload;
    }

    const combined: Record<string, unknown> = {};
    for (const part of parts) {
      try {
        combined[part.path || part.payloadType] = JSON.parse(part.payload);
      } catch {
        combined[part.path || part.payloadType] = part.payload;
      }
    }
    return JSON.stringify(combined, null, 2);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const url = `${FABRIC_API_BASE}${path}`;
    let attempt = 0;

    while (true) {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.options.bearerToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init.headers ?? {}),
        },
      });

      if (response.ok) {
        if (response.status === 204) {
          return {} as T;
        }
        return (await response.json()) as T;
      }

      const body = await response.text().catch(() => '');
      const retryAfter = this.parseRetryAfter(response);

      if (response.status === 401) {
        throw new FabricApiError(
          'Authentication failed (401). Verify your bearer token is valid and not expired.',
          401
        );
      }

      if (response.status === 403) {
        throw new FabricApiError(
          'Permission denied (403). Ensure the token has read access to the workspace and its items.',
          403
        );
      }

      if (response.status === 429 && attempt < this.maxRetries) {
        const waitMs = (retryAfter ?? Math.pow(2, attempt + 1)) * 1000;
        await this.delay(waitMs);
        attempt++;
        continue;
      }

      if (response.status === 429) {
        throw new FabricApiError(
          `Rate limited (429) after ${this.maxRetries} retries. Try again later.`,
          429,
          retryAfter
        );
      }

      throw new FabricApiError(
        `Fabric API error ${response.status}: ${body || response.statusText}`,
        response.status
      );
    }
  }

  private parseRetryAfter(response: Response): number | undefined {
    const header = response.headers.get('Retry-After');
    if (!header) {
      return undefined;
    }
    const seconds = parseInt(header, 10);
    return Number.isNaN(seconds) ? undefined : seconds;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
