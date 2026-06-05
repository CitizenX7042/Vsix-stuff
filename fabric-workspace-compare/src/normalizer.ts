/**
 * Fields commonly present in Fabric item definitions that change between
 * environments but do not reflect meaningful content differences.
 */
const VOLATILE_KEYS = new Set([
  'id',
  'itemId',
  'workspaceId',
  'createdDate',
  'modifiedDate',
  'createdTime',
  'modifiedTime',
  'lastModified',
  'etag',
  'version',
  'objectId',
  'tenantId',
  'createdBy',
  'modifiedBy',
]);

/**
 * Normalizes JSON for stable comparison between source and target definitions.
 */
export function normalizeJson(input: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return input.trim();
  }

  const normalized = sortAndStrip(parsed);
  return JSON.stringify(normalized, null, 2);
}

export function definitionsAreEqual(
  sourceDefinition: string,
  targetDefinition: string
): boolean {
  return normalizeJson(sourceDefinition) === normalizeJson(targetDefinition);
}

function sortAndStrip(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortAndStrip);
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      if (VOLATILE_KEYS.has(key)) {
        continue;
      }
      result[key] = sortAndStrip(record[key]);
    }
    return result;
  }

  return value;
}
