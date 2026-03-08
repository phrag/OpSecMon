export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from '../../_cors';

const RANSOMWARE_LIVE_API = 'https://api.ransomware.live/v2';
const CACHE_TTL = 900;

interface RawVictim {
  victim?: string;
  group?: string;
  discovered?: string;
  published?: string;
  country?: string;
  activity?: string;
  website?: string;
  description?: string;
}

interface RansomwareVictim {
  name: string;
  group: string;
  discoveredAt: number;
  attackedAt: number;
  country: string;
  sector: string;
  website: string;
  status: string;
  description: string;
}

let cachedData: { victims: RansomwareVictim[]; cachedAt: number } | null = null;

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
    const days = parseInt(url.searchParams.get('days') || '30', 10) || 30;
    const groupFilter = url.searchParams.get('group') || '';

    if (cachedData && Date.now() - cachedData.cachedAt < CACHE_TTL * 1000) {
      let filtered = cachedData.victims;
      
      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(v => v.discoveredAt >= cutoff);
      
      if (groupFilter) {
        filtered = filtered.filter(v => v.group.toLowerCase() === groupFilter.toLowerCase());
      }
      
      const page = filtered.slice(cursor, cursor + pageSize);
      const hasMore = cursor + pageSize < filtered.length;
      
      return new Response(JSON.stringify({
        victims: page,
        totalCount: filtered.length,
        nextCursor: hasMore ? String(cursor + pageSize) : '',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=120, s-maxage=300',
          ...corsHeaders,
        },
      });
    }

    const response = await fetch(`${RANSOMWARE_LIVE_API}/recentcyberattacks`, {
      headers: { 'User-Agent': 'WorldMonitor/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[ransomware] victims API returned ${response.status}`);
      return new Response(JSON.stringify({ victims: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await response.json() as RawVictim[];
    if (!Array.isArray(data)) {
      return new Response(JSON.stringify({ victims: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const victims: RansomwareVictim[] = data.map((v) => ({
      name: v.victim || 'Unknown',
      group: v.group || 'Unknown',
      discoveredAt: v.discovered ? new Date(v.discovered).getTime() : Date.now(),
      attackedAt: v.published ? new Date(v.published).getTime() : Date.now(),
      country: v.country || '',
      sector: v.activity || '',
      website: v.website || '',
      status: 'published',
      description: v.description || '',
    })).sort((a, b) => b.discoveredAt - a.discoveredAt);

    cachedData = { victims, cachedAt: Date.now() };

    let filtered = victims;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(v => v.discoveredAt >= cutoff);
    
    if (groupFilter) {
      filtered = filtered.filter(v => v.group.toLowerCase() === groupFilter.toLowerCase());
    }

    const page = filtered.slice(cursor, cursor + pageSize);
    const hasMore = cursor + pageSize < filtered.length;

    return new Response(JSON.stringify({
      victims: page,
      totalCount: filtered.length,
      nextCursor: hasMore ? String(cursor + pageSize) : '',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120, s-maxage=300',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[ransomware] victims fetch failed:', error);
    return new Response(JSON.stringify({ victims: [], totalCount: 0, nextCursor: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
