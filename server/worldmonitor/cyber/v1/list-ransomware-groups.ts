import type {
  ServerContext,
  ListRansomwareGroupsRequest,
  ListRansomwareGroupsResponse,
} from '../../../../src/generated/server/worldmonitor/cyber/v1/service_server';

import { cachedFetchJson } from '../../../_shared/redis';

const RANSOMWARE_DATA_URL = 'https://data.ransomware.live/groups.json';
const REDIS_CACHE_KEY = 'cyber:ransomware:groups:v2';
const REDIS_CACHE_TTL = 3600;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

interface RawRansomwareGroup {
  name: string;
  description?: string;
  locations?: Array<{ fqdn?: string; slug?: string; available?: boolean }>;
  profile?: string[];
  meta?: string;
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function clampInt(val: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(val)));
}

export async function listRansomwareGroups(
  _ctx: ServerContext,
  req: ListRansomwareGroupsRequest,
): Promise<ListRansomwareGroupsResponse> {
  const empty: ListRansomwareGroupsResponse = { groups: [], totalCount: 0, nextCursor: '' };

  try {
    const pageSize = clampInt(req.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const offset = parseCursor(req.cursor);

    const cached = await cachedFetchJson<{ groups: ListRansomwareGroupsResponse['groups'] }>(
      REDIS_CACHE_KEY,
      REDIS_CACHE_TTL,
      async () => {
        const response = await fetch(RANSOMWARE_DATA_URL, {
          headers: { 'User-Agent': 'WorldMonitor/1.0' },
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          console.warn(`[ransomware] API returned ${response.status}`);
          return null;
        }

        const data = await response.json() as RawRansomwareGroup[];
        if (!Array.isArray(data)) return null;

        const groups = data.map((g): ListRansomwareGroupsResponse['groups'][0] => ({
          name: g.name || 'Unknown',
          victimCount: 0,
          lastSeenAt: Date.now(),
          firstSeenAt: Date.now(),
          description: g.description || g.meta || '',
          aliases: g.profile || [],
          targetSectors: [],
          targetCountries: [],
          status: 'active',
          sites: g.locations?.filter(l => l.fqdn).map(l => l.fqdn!) || [],
        }));

        return { groups };
      },
    );

    if (!cached?.groups?.length) return empty;

    let filteredGroups = cached.groups;

    if (offset >= filteredGroups.length) return empty;

    const page = filteredGroups.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < filteredGroups.length;

    return {
      groups: page,
      totalCount: filteredGroups.length,
      nextCursor: hasMore ? String(offset + pageSize) : '',
    };
  } catch (err) {
    console.error('[ransomware] listRansomwareGroups failed', err);
    return empty;
  }
}
