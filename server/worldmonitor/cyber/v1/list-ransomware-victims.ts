import type {
  ServerContext,
  ListRansomwareVictimsRequest,
  ListRansomwareVictimsResponse,
} from '../../../../src/generated/server/worldmonitor/cyber/v1/service_server';

import { cachedFetchJson } from '../../../_shared/redis';

const RANSOMWARE_DATA_URL = 'https://data.ransomware.live/victims.json';
const REDIS_CACHE_KEY = 'cyber:ransomware:victims:v2';
const REDIS_CACHE_TTL = 1800;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

interface RawVictim {
  post_title?: string;
  victim_name?: string;
  group_name?: string;
  discovered?: string;
  published?: string;
  country?: string;
  activity?: string;
  website?: string;
  description?: string;
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

function parseDate(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export async function listRansomwareVictims(
  _ctx: ServerContext,
  req: ListRansomwareVictimsRequest,
): Promise<ListRansomwareVictimsResponse> {
  const empty: ListRansomwareVictimsResponse = { victims: [], totalCount: 0, nextCursor: '' };

  try {
    const pageSize = clampInt(req.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const days = clampInt(req.days, DEFAULT_DAYS, 1, MAX_DAYS);
    const offset = parseCursor(req.cursor);
    const groupFilter = req.group?.toLowerCase() || '';

    const cacheKey = `${REDIS_CACHE_KEY}:${days}`;

    const cached = await cachedFetchJson<{ victims: ListRansomwareVictimsResponse['victims'] }>(
      cacheKey,
      REDIS_CACHE_TTL,
      async () => {
        const response = await fetch(RANSOMWARE_DATA_URL, {
          headers: { 'User-Agent': 'WorldMonitor/1.0' },
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          console.warn(`[ransomware] victims API returned ${response.status}`);
          return null;
        }

        const data = await response.json() as RawVictim[];
        if (!Array.isArray(data)) return null;

        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        const victims = data
          .map((v): ListRansomwareVictimsResponse['victims'][0] => ({
            name: v.post_title || v.victim_name || 'Unknown',
            group: v.group_name || 'Unknown',
            discoveredAt: parseDate(v.discovered),
            attackedAt: parseDate(v.published),
            country: v.country || '',
            sector: v.activity || '',
            website: v.website || '',
            status: 'disclosed',
            description: v.description || '',
          }))
          .filter(v => v.discoveredAt > cutoff)
          .sort((a, b) => b.discoveredAt - a.discoveredAt);

        return { victims };
      },
    );

    if (!cached?.victims?.length) return empty;

    let filteredVictims = cached.victims;

    if (groupFilter) {
      filteredVictims = filteredVictims.filter(v => v.group.toLowerCase() === groupFilter);
    }

    if (offset >= filteredVictims.length) return empty;

    const page = filteredVictims.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < filteredVictims.length;

    return {
      victims: page,
      totalCount: filteredVictims.length,
      nextCursor: hasMore ? String(offset + pageSize) : '',
    };
  } catch (err) {
    console.error('[ransomware] listRansomwareVictims failed', err);
    return empty;
  }
}
