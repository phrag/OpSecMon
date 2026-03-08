export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from '../../_cors';

const HIBP_API = 'https://haveibeenpwned.com/api/v3';
const CACHE_TTL = 3600;

interface DataBreach {
  name: string;
  title: string;
  domain: string;
  breachDate: number;
  addedDate: number;
  modifiedDate: number;
  pwnCount: number;
  description: string;
  dataClasses: string[];
  isVerified: boolean;
  isSensitive: boolean;
  logoPath: string;
}

let cachedData: { breaches: DataBreach[]; cachedAt: number } | null = null;

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
    const days = parseInt(url.searchParams.get('days') || '365', 10) || 365;

    if (cachedData && Date.now() - cachedData.cachedAt < CACHE_TTL * 1000) {
      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
      const filtered = cachedData.breaches.filter(b => b.addedDate >= cutoff);
      
      const page = filtered.slice(cursor, cursor + pageSize);
      const hasMore = cursor + pageSize < filtered.length;
      
      return new Response(JSON.stringify({
        breaches: page,
        totalCount: filtered.length,
        nextCursor: hasMore ? String(cursor + pageSize) : '',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=600, s-maxage=1800',
          ...corsHeaders,
        },
      });
    }

    const hibpApiKey = process.env.HIBP_API_KEY;
    if (!hibpApiKey) {
      console.warn('[breaches] HIBP_API_KEY not configured');
      return new Response(JSON.stringify({ breaches: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const response = await fetch(`${HIBP_API}/breaches`, {
      headers: {
        'User-Agent': 'WorldMonitor/1.0',
        'hibp-api-key': hibpApiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[breaches] HIBP API returned ${response.status}`);
      return new Response(JSON.stringify({ breaches: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return new Response(JSON.stringify({ breaches: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const breaches: DataBreach[] = data.map((b: any) => ({
      name: b.Name || '',
      title: b.Title || b.Name || '',
      domain: b.Domain || '',
      breachDate: b.BreachDate ? new Date(b.BreachDate).getTime() : 0,
      addedDate: b.AddedDate ? new Date(b.AddedDate).getTime() : 0,
      modifiedDate: b.ModifiedDate ? new Date(b.ModifiedDate).getTime() : 0,
      pwnCount: b.PwnCount || 0,
      description: b.Description || '',
      dataClasses: b.DataClasses || [],
      isVerified: b.IsVerified || false,
      isSensitive: b.IsSensitive || false,
      logoPath: b.LogoPath || '',
    })).sort((a: DataBreach, b: DataBreach) => b.addedDate - a.addedDate);

    cachedData = { breaches, cachedAt: Date.now() };

    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const filtered = breaches.filter(b => b.addedDate >= cutoff);

    const page = filtered.slice(cursor, cursor + pageSize);
    const hasMore = cursor + pageSize < filtered.length;

    return new Response(JSON.stringify({
      breaches: page,
      totalCount: filtered.length,
      nextCursor: hasMore ? String(cursor + pageSize) : '',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600, s-maxage=1800',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[breaches] fetch failed:', error);
    return new Response(JSON.stringify({ breaches: [], totalCount: 0, nextCursor: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
