export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from '../../_cors';

const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CACHE_TTL = 900;

interface CVE {
  id: string;
  description: string;
  publishedAt: number;
  modifiedAt: number;
  cvssScore: number;
  cvssVector: string;
  severity: string;
  references: string[];
  affectedProducts: string[];
  cweIds: string[];
}

let cachedData: { cves: CVE[]; cachedAt: number } | null = null;

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
    const severity = url.searchParams.get('severity') || '';
    const days = parseInt(url.searchParams.get('days') || '7', 10) || 7;

    if (cachedData && Date.now() - cachedData.cachedAt < CACHE_TTL * 1000) {
      let filtered = cachedData.cves;
      
      if (severity) {
        filtered = filtered.filter(c => c.severity.toLowerCase() === severity.toLowerCase());
      }
      
      const page = filtered.slice(cursor, cursor + pageSize);
      const hasMore = cursor + pageSize < filtered.length;
      
      return new Response(JSON.stringify({
        cves: page,
        totalCount: filtered.length,
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

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const nvdUrl = new URL(NVD_API);
    nvdUrl.searchParams.set('pubStartDate', startDate.toISOString());
    nvdUrl.searchParams.set('pubEndDate', endDate.toISOString());
    nvdUrl.searchParams.set('resultsPerPage', '100');

    const headers: Record<string, string> = {
      'User-Agent': 'WorldMonitor/1.0',
      'Accept': 'application/json',
    };
    
    const nvdApiKey = process.env.NVD_API_KEY;
    if (nvdApiKey) {
      headers['apiKey'] = nvdApiKey;
    }

    const response = await fetch(nvdUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[cve] NVD API returned ${response.status}`);
      return new Response(JSON.stringify({ cves: [], totalCount: 0, nextCursor: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await response.json();
    const vulnerabilities = data.vulnerabilities || [];

    const cves: CVE[] = vulnerabilities.map((vuln: any) => {
      const cve = vuln.cve || {};
      const metrics = cve.metrics || {};
      const cvssV31 = metrics.cvssMetricV31?.[0]?.cvssData || {};
      const cvssV30 = metrics.cvssMetricV30?.[0]?.cvssData || {};
      const cvssV2 = metrics.cvssMetricV2?.[0]?.cvssData || {};
      const cvss = cvssV31.baseScore || cvssV30.baseScore || cvssV2.baseScore || 0;
      const vector = cvssV31.vectorString || cvssV30.vectorString || cvssV2.vectorString || '';
      
      let sev = 'UNKNOWN';
      if (cvss >= 9.0) sev = 'CRITICAL';
      else if (cvss >= 7.0) sev = 'HIGH';
      else if (cvss >= 4.0) sev = 'MEDIUM';
      else if (cvss > 0) sev = 'LOW';

      const descriptions = cve.descriptions || [];
      const englishDesc = descriptions.find((d: any) => d.lang === 'en')?.value || '';

      return {
        id: cve.id || '',
        description: englishDesc,
        publishedAt: cve.published ? new Date(cve.published).getTime() : Date.now(),
        modifiedAt: cve.lastModified ? new Date(cve.lastModified).getTime() : Date.now(),
        cvssScore: cvss,
        cvssVector: vector,
        severity: sev,
        references: (cve.references || []).map((r: any) => r.url).filter(Boolean).slice(0, 5),
        affectedProducts: [],
        cweIds: (cve.weaknesses || []).flatMap((w: any) => 
          (w.description || []).map((d: any) => d.value)
        ).filter(Boolean),
      };
    }).sort((a: CVE, b: CVE) => b.cvssScore - a.cvssScore);

    cachedData = { cves, cachedAt: Date.now() };

    let filtered = cves;
    if (severity) {
      filtered = filtered.filter(c => c.severity.toLowerCase() === severity.toLowerCase());
    }

    const page = filtered.slice(cursor, cursor + pageSize);
    const hasMore = cursor + pageSize < filtered.length;

    return new Response(JSON.stringify({
      cves: page,
      totalCount: filtered.length,
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
    console.error('[cve] fetch failed:', error);
    return new Response(JSON.stringify({ cves: [], totalCount: 0, nextCursor: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
