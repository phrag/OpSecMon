export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from '../../_cors';

const RANSOMWARE_LIVE_API = 'https://api.ransomware.live/v2';
const CACHE_TTL = 3600;

interface RawRansomwareGroup {
  name: string;
  description?: string;
  locations?: Array<{ fqdn?: string; slug?: string; available?: boolean }>;
  profile?: string[];
  meta?: string;
}

interface RansomwareGroup {
  name: string;
  victimCount: number;
  lastSeenAt: number;
  firstSeenAt: number;
  description: string;
  aliases: string[];
  targetSectors: string[];
  targetCountries: string[];
  status: string;
  sites: string[];
}

let cachedData: { groups: RansomwareGroup[]; cachedAt: number } | null = null;

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const url = new URL(req.url);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page_size') || '50', 10)));
    const cursor = parseInt(url.searchParams.get('cursor') || '0', 10) || 0;

    if (cachedData && Date.now() - cachedData.cachedAt < CACHE_TTL * 1000) {
      const page = cachedData.groups.slice(cursor, cursor + pageSize);
      const hasMore = cursor + pageSize < cachedData.groups.length;
      
      return new Response(JSON.stringify({
        groups: page,
        totalCount: cachedData.groups.length,
        nextCursor: hasMore ? String(cursor + pageSize) : '',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=600',
          ...corsHeaders,
        },
      });
    }

    const response = await fetch(`${RANSOMWARE_LIVE_API}/groups`, {
      headers: { 'User-Agent': 'WorldMonitor/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[ransomware] API returned ${response.status}`);
      return new Response(JSON.stringify({ groups: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await response.json() as RawRansomwareGroup[];
    if (!Array.isArray(data)) {
      return new Response(JSON.stringify({ groups: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const groups: RansomwareGroup[] = data.map((g) => ({
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

    cachedData = { groups, cachedAt: Date.now() };

    const page = groups.slice(cursor, cursor + pageSize);
    const hasMore = cursor + pageSize < groups.length;

    return new Response(JSON.stringify({
      groups: page,
      totalCount: groups.length,
      nextCursor: hasMore ? String(cursor + pageSize) : '',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[ransomware] groups fetch failed:', error);
    return new Response(JSON.stringify({ groups: [], totalCount: 0, nextCursor: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
