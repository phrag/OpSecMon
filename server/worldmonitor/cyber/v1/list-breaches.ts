import type {
  ServerContext,
  ListBreachesRequest,
  ListBreachesResponse,
} from '../../../../src/generated/server/worldmonitor/cyber/v1/service_server';

import { cachedFetchJson } from '../../../_shared/redis';

const HIBP_API_BASE = 'https://haveibeenpwned.com/api/v3';
const REDIS_CACHE_KEY = 'cyber:breaches:v1';
const REDIS_CACHE_TTL = 3600;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  ModifiedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
  IsSpamList: boolean;
  LogoPath: string;
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

export async function listBreaches(
  _ctx: ServerContext,
  req: ListBreachesRequest,
): Promise<ListBreachesResponse> {
  const empty: ListBreachesResponse = { breaches: [], totalCount: 0, nextCursor: '' };

  try {
    const pageSize = clampInt(req.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const days = clampInt(req.days, DEFAULT_DAYS, 1, MAX_DAYS);
    const offset = parseCursor(req.cursor);
    const verifiedOnly = req.verifiedOnly ?? false;

    const cacheKey = `${REDIS_CACHE_KEY}:all`;

    const cached = await cachedFetchJson<{ breaches: ListBreachesResponse['breaches'] }>(
      cacheKey,
      REDIS_CACHE_TTL,
      async () => {
        const apiKey = process.env.HIBP_API_KEY;
        const headers: Record<string, string> = {
          'User-Agent': 'WorldMonitor',
        };
        if (apiKey) {
          headers['hibp-api-key'] = apiKey;
        }

        const response = await fetch(`${HIBP_API_BASE}/breaches`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          console.warn(`[breaches] HIBP API returned ${response.status}`);
          return null;
        }

        const data = await response.json() as HibpBreach[];
        if (!Array.isArray(data)) return null;

        const breaches = data.map((b): ListBreachesResponse['breaches'][0] => ({
          name: b.Name,
          title: b.Title,
          domain: b.Domain,
          breachDate: parseDate(b.BreachDate),
          addedDate: parseDate(b.AddedDate),
          modifiedDate: parseDate(b.ModifiedDate),
          pwnCount: b.PwnCount,
          description: b.Description?.replace(/<[^>]*>/g, '') || '',
          dataClasses: b.DataClasses || [],
          isVerified: b.IsVerified,
          isFabricated: b.IsFabricated,
          isSensitive: b.IsSensitive,
          isRetired: b.IsRetired,
          isSpamList: b.IsSpamList,
          logoPath: b.LogoPath,
        })).sort((a, b) => b.addedDate - a.addedDate);

        return { breaches };
      },
    );

    if (!cached?.breaches?.length) return empty;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let filteredBreaches = cached.breaches.filter(b => b.addedDate > cutoff);

    if (verifiedOnly) {
      filteredBreaches = filteredBreaches.filter(b => b.isVerified);
    }

    filteredBreaches = filteredBreaches.filter(b => !b.isRetired && !b.isFabricated && !b.isSpamList);

    if (offset >= filteredBreaches.length) return empty;

    const page = filteredBreaches.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < filteredBreaches.length;

    return {
      breaches: page,
      totalCount: filteredBreaches.length,
      nextCursor: hasMore ? String(offset + pageSize) : '',
    };
  } catch (err) {
    console.error('[breaches] listBreaches failed', err);
    return empty;
  }
}
