import { createCircuitBreaker } from '@/utils';

export interface CVE {
  id: string;
  description: string;
  cvssScore: number;
  severity: string;
  cvssVector: string;
  affectedProducts: string[];
  cweIds: string[];
  publishedAt: number;
  modifiedAt: number;
  references: string[];
  inKev: boolean;
  vendor: string;
  product: string;
}

interface ListCVEsResponse {
  cves: CVE[];
  totalCount: number;
  nextCursor: string;
}

const cveBreaker = createCircuitBreaker<ListCVEsResponse>({
  name: 'CVEs',
  cacheTtlMs: 15 * 60 * 1000,
  persistCache: true,
});

const emptyResponse: ListCVEsResponse = { cves: [], totalCount: 0, nextCursor: '' };

export async function fetchCVEs(options: {
  minCvss?: number;
  severity?: string;
  keyword?: string;
  days?: number;
  pageSize?: number;
  cursor?: string;
  kevOnly?: boolean;
} = {}): Promise<ListCVEsResponse> {
  const params = new URLSearchParams();
  if (options.minCvss) params.set('min_cvss', String(options.minCvss));
  if (options.severity) params.set('severity', options.severity);
  if (options.keyword) params.set('keyword', options.keyword);
  if (options.days) params.set('days', String(options.days));
  if (options.pageSize) params.set('page_size', String(options.pageSize));
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.kevOnly) params.set('kev_only', 'true');

  const resp = await cveBreaker.execute(async () => {
    const response = await fetch(`/api/cyber/v1/list-cves?${params}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<ListCVEsResponse>;
  }, emptyResponse);

  return resp;
}

export function getSeverityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return 'var(--semantic-critical)';
    case 'HIGH': return 'var(--semantic-high)';
    case 'MEDIUM': return 'var(--semantic-elevated)';
    case 'LOW': return 'var(--semantic-normal)';
    default: return 'var(--text-muted)';
  }
}

export function formatCvssScore(score: number): string {
  return score.toFixed(1);
}
