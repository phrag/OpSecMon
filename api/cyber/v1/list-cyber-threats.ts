export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from '../../_cors';

const FEODO_URL = 'https://feodotracker.abuse.ch/downloads/ipblocklist.json';
const C2INTEL_URL = 'https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s-30day.csv';
const CACHE_TTL = 3600;

interface CyberThreat {
  id: string;
  type: string;
  source: string;
  indicator: string;
  indicatorType: string;
  lat: number;
  lon: number;
  country: string;
  severity: string;
  malwareFamily: string;
  tags: string[];
  firstSeen: string | null;
  lastSeen: string | null;
}

let cachedData: { threats: CyberThreat[]; cachedAt: number } | null = null;

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.6], BR: [-14.2, -51.9],
  GB: [55.4, -3.4], DE: [51.2, 10.5], FR: [46.2, 2.2], IT: [41.9, 12.6],
  NL: [52.1, 5.3], RU: [61.5, 105.3], CN: [35.9, 104.2], JP: [36.2, 138.3],
  KR: [35.9, 127.8], IN: [20.6, 79.0], AU: [-25.3, 133.8], ZA: [-30.6, 22.9],
  SA: [23.9, 45.1], AE: [23.4, 53.8], IL: [31.0, 34.9], IR: [32.4, 53.7],
  TR: [39.0, 35.2], UA: [48.4, 31.2], PL: [51.9, 19.1], SE: [60.1, 18.6],
  SG: [1.4, 103.8], HK: [22.4, 114.1], TW: [23.7, 121.0], VN: [14.1, 108.3],
};

function djb2(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) & 0xffffffff;
  return h;
}

function getCountryCentroid(countryCode: string, seed?: string): { lat: number; lon: number } | null {
  if (!countryCode) return null;
  const coords = COUNTRY_CENTROIDS[countryCode.toUpperCase()];
  if (!coords) return null;
  const key = seed || countryCode;
  const latOffset = (((djb2(key) & 0xffff) / 0xffff) - 0.5) * 2;
  const lonOffset = (((djb2(key + ':lon') & 0xffff) / 0xffff) - 0.5) * 2;
  return { lat: coords[0] + latOffset, lon: coords[1] + lonOffset };
}

function inferSeverity(malwareFamily: string, status?: string): string {
  if (/emotet|qakbot|trickbot|dridex|ransom/i.test(malwareFamily)) return 'critical';
  if (status === 'online') return 'high';
  return 'medium';
}

async function fetchFeodoThreats(limit: number, cutoffMs: number): Promise<CyberThreat[]> {
  try {
    const response = await fetch(FEODO_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'WorldMonitor/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];

    const payload = await response.json();
    const records: any[] = Array.isArray(payload) ? payload : (payload?.data || []);

    const threats: CyberThreat[] = [];
    for (const r of records) {
      const ip = r?.ip_address || r?.dst_ip || r?.ip || '';
      if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) continue;

      const firstSeen = r?.first_seen || r?.first_seen_utc || r?.dateadded;
      const lastSeen = r?.last_online || r?.last_seen || firstSeen;
      const firstSeenMs = firstSeen ? new Date(firstSeen).getTime() : 0;
      const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;

      if (lastSeenMs && lastSeenMs < cutoffMs) continue;

      const malwareFamily = r?.malware || r?.malware_family || '';
      const status = (r?.status || '').toLowerCase();
      const country = r?.country || r?.country_code || '';

      const centroid = getCountryCentroid(country, ip);
      
      threats.push({
        id: `feodo:${ip}`,
        type: 'c2_server',
        source: 'feodo',
        indicator: ip,
        indicatorType: 'ip',
        lat: centroid?.lat || 0,
        lon: centroid?.lon || 0,
        country,
        severity: inferSeverity(malwareFamily, status),
        malwareFamily,
        tags: ['botnet', 'c2'],
        firstSeen: firstSeenMs ? new Date(firstSeenMs).toISOString() : null,
        lastSeen: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
      });

      if (threats.length >= limit) break;
    }

    return threats;
  } catch {
    return [];
  }
}

async function fetchC2IntelThreats(limit: number): Promise<CyberThreat[]> {
  try {
    const response = await fetch(C2INTEL_URL, {
      headers: { Accept: 'text/plain', 'User-Agent': 'WorldMonitor/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];

    const text = await response.text();
    const lines = text.split('\n').filter(l => l && !l.startsWith('#'));

    const threats: CyberThreat[] = [];
    for (const line of lines) {
      const commaIdx = line.indexOf(',');
      if (commaIdx < 0) continue;

      const ip = line.slice(0, commaIdx).trim();
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) continue;

      const description = line.slice(commaIdx + 1).trim();
      const malwareFamily = description
        .replace(/^Possible\s+/i, '')
        .replace(/\s+C2\s+IP$/i, '')
        .trim() || 'Unknown';

      const severity = /cobaltstrike|cobalt.strike|brute.?ratel/i.test(description) ? 'high' : 'medium';
      const tags = ['c2'];
      if (/cobaltstrike|cobalt.strike/i.test(description)) tags.push('cobaltstrike');

      const centroid = getCountryCentroid('US', ip);

      threats.push({
        id: `c2intel:${ip}`,
        type: 'c2_server',
        source: 'c2intel',
        indicator: ip,
        indicatorType: 'ip',
        lat: centroid?.lat || 40,
        lon: centroid?.lon || -100,
        country: '',
        severity,
        malwareFamily,
        tags,
        firstSeen: null,
        lastSeen: null,
      });

      if (threats.length >= limit) break;
    }

    return threats;
  } catch {
    return [];
  }
}

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
    const pageSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get('page_size') || '200', 10)));
    const cursor = parseInt(url.searchParams.get('cursor') || '0', 10) || 0;
    const days = parseInt(url.searchParams.get('days') || '14', 10) || 14;

    if (cachedData && Date.now() - cachedData.cachedAt < CACHE_TTL * 1000) {
      const page = cachedData.threats.slice(cursor, cursor + pageSize);
      const hasMore = cursor + pageSize < cachedData.threats.length;
      
      return new Response(JSON.stringify({
        threats: page,
        totalCount: cachedData.threats.length,
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

    const now = Date.now();
    const cutoffMs = now - days * 24 * 60 * 60 * 1000;

    const [feodoThreats, c2intelThreats] = await Promise.all([
      fetchFeodoThreats(300, cutoffMs),
      fetchC2IntelThreats(200),
    ]);

    const allThreats = [...feodoThreats, ...c2intelThreats];
    
    allThreats.sort((a, b) => {
      const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      const diff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
      if (diff !== 0) return diff;
      const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return bTime - aTime;
    });

    cachedData = { threats: allThreats, cachedAt: Date.now() };

    const page = allThreats.slice(cursor, cursor + pageSize);
    const hasMore = cursor + pageSize < allThreats.length;

    return new Response(JSON.stringify({
      threats: page,
      totalCount: allThreats.length,
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
    console.error('[cyber-threats] fetch failed:', error);
    return new Response(JSON.stringify({ threats: [], totalCount: 0, nextCursor: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
