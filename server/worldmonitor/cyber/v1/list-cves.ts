import type {
  ServerContext,
  ListCVEsRequest,
  ListCVEsResponse,
} from '../../../../src/generated/server/worldmonitor/cyber/v1/service_server';

import { cachedFetchJson } from '../../../_shared/redis';

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const REDIS_CACHE_KEY = 'cyber:cve:v1';
const REDIS_CACHE_TTL = 1800;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

interface NvdCveItem {
  cve: {
    id: string;
    descriptions?: Array<{ lang: string; value: string }>;
    metrics?: {
      cvssMetricV31?: Array<{
        cvssData: {
          baseScore: number;
          baseSeverity: string;
          vectorString: string;
        };
      }>;
      cvssMetricV30?: Array<{
        cvssData: {
          baseScore: number;
          baseSeverity: string;
          vectorString: string;
        };
      }>;
    };
    weaknesses?: Array<{
      description: Array<{ lang: string; value: string }>;
    }>;
    configurations?: Array<{
      nodes: Array<{
        cpeMatch: Array<{
          criteria: string;
          vulnerable: boolean;
        }>;
      }>;
    }>;
    references?: Array<{ url: string }>;
    published?: string;
    lastModified?: string;
  };
}

interface NvdResponse {
  vulnerabilities?: NvdCveItem[];
  totalResults?: number;
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

function extractVendorProduct(cpe: string): { vendor: string; product: string } {
  const parts = cpe.split(':');
  return {
    vendor: parts[3] || '',
    product: parts[4] || '',
  };
}

export async function listCVEs(
  _ctx: ServerContext,
  req: ListCVEsRequest,
): Promise<ListCVEsResponse> {
  const empty: ListCVEsResponse = { cves: [], totalCount: 0, nextCursor: '' };

  try {
    const pageSize = clampInt(req.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const days = clampInt(req.days, DEFAULT_DAYS, 1, MAX_DAYS);
    const offset = parseCursor(req.cursor);
    const minCvss = req.minCvss || 0;
    const severity = req.severity?.toUpperCase() || '';
    const keyword = req.keyword?.toLowerCase() || '';

    const cacheKey = `${REDIS_CACHE_KEY}:${days}:${minCvss}:${severity}`;

    const cached = await cachedFetchJson<{ cves: ListCVEsResponse['cves'] }>(
      cacheKey,
      REDIS_CACHE_TTL,
      async () => {
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const pubStartDate = startDate.toISOString().split('.')[0];
        const pubEndDate = now.toISOString().split('.')[0];

        const params = new URLSearchParams({
          pubStartDate,
          pubEndDate,
          resultsPerPage: '200',
        });

        if (minCvss >= 7) {
          params.set('cvssV3Severity', 'CRITICAL');
        } else if (minCvss >= 4) {
          params.set('cvssV3Severity', 'HIGH');
        }

        const apiKey = process.env.NVD_API_KEY;
        const headers: Record<string, string> = {
          'User-Agent': 'WorldMonitor/1.0',
        };
        if (apiKey) {
          headers['apiKey'] = apiKey;
        }

        const response = await fetch(`${NVD_API_BASE}?${params}`, {
          headers,
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          console.warn(`[cve] NVD API returned ${response.status}`);
          return null;
        }

        const data = await response.json() as NvdResponse;
        if (!data.vulnerabilities?.length) return { cves: [] };

        const cves = data.vulnerabilities
          .map((item): ListCVEsResponse['cves'][0] | null => {
            const cve = item.cve;
            const desc = cve.descriptions?.find(d => d.lang === 'en')?.value || '';
            
            const cvssMetric = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0];
            const cvssScore = cvssMetric?.cvssData?.baseScore || 0;
            const cvssVector = cvssMetric?.cvssData?.vectorString || '';
            const cvsSeverity = cvssMetric?.cvssData?.baseSeverity || 'NONE';

            const cweIds = cve.weaknesses
              ?.flatMap(w => w.description.filter(d => d.lang === 'en').map(d => d.value))
              .filter(Boolean) || [];

            const cpeMatches = cve.configurations
              ?.flatMap(c => c.nodes.flatMap(n => n.cpeMatch.filter(m => m.vulnerable).map(m => m.criteria))) || [];
            
            const vpInfo = cpeMatches[0] ? extractVendorProduct(cpeMatches[0]) : { vendor: '', product: '' };

            const references = cve.references?.map(r => r.url).slice(0, 5) || [];

            return {
              id: cve.id,
              description: desc.substring(0, 500),
              cvssScore,
              severity: cvsSeverity,
              cvssVector,
              affectedProducts: cpeMatches.slice(0, 10),
              cweIds,
              publishedAt: parseDate(cve.published),
              modifiedAt: parseDate(cve.lastModified),
              references,
              inKev: false,
              vendor: vpInfo.vendor,
              product: vpInfo.product,
            };
          })
          .filter((c): c is ListCVEsResponse['cves'][0] => c !== null)
          .filter(c => c.cvssScore >= minCvss)
          .filter(c => !severity || c.severity === severity)
          .sort((a, b) => b.cvssScore - a.cvssScore || b.publishedAt - a.publishedAt);

        return { cves };
      },
    );

    if (!cached?.cves?.length) return empty;

    let filteredCves = cached.cves;

    if (keyword) {
      filteredCves = filteredCves.filter(c => 
        c.id.toLowerCase().includes(keyword) ||
        c.description.toLowerCase().includes(keyword) ||
        c.vendor.toLowerCase().includes(keyword) ||
        c.product.toLowerCase().includes(keyword)
      );
    }

    if (offset >= filteredCves.length) return empty;

    const page = filteredCves.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < filteredCves.length;

    return {
      cves: page,
      totalCount: filteredCves.length,
      nextCursor: hasMore ? String(offset + pageSize) : '',
    };
  } catch (err) {
    console.error('[cve] listCVEs failed', err);
    return empty;
  }
}
