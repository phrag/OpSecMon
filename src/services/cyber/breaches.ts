import { createCircuitBreaker } from '@/utils';

export interface DataBreach {
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
  isFabricated: boolean;
  isSensitive: boolean;
  isRetired: boolean;
  isSpamList: boolean;
  logoPath: string;
}

interface ListBreachesResponse {
  breaches: DataBreach[];
  totalCount: number;
  nextCursor: string;
}

const breachesBreaker = createCircuitBreaker<ListBreachesResponse>({
  name: 'Data Breaches',
  cacheTtlMs: 30 * 60 * 1000,
  persistCache: true,
});

const emptyResponse: ListBreachesResponse = { breaches: [], totalCount: 0, nextCursor: '' };

export async function fetchBreaches(options: {
  days?: number;
  verifiedOnly?: boolean;
  pageSize?: number;
  cursor?: string;
} = {}): Promise<ListBreachesResponse> {
  const params = new URLSearchParams();
  if (options.days) params.set('days', String(options.days));
  if (options.verifiedOnly) params.set('verified_only', 'true');
  if (options.pageSize) params.set('page_size', String(options.pageSize));
  if (options.cursor) params.set('cursor', options.cursor);

  const resp = await breachesBreaker.execute(async () => {
    const response = await fetch(`/api/cyber/v1/list-breaches?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<ListBreachesResponse>;
  }, emptyResponse);

  return resp;
}

export function formatPwnCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function getDataClassIcon(dataClass: string): string {
  const lower = dataClass.toLowerCase();
  if (lower.includes('password')) return '🔑';
  if (lower.includes('email')) return '📧';
  if (lower.includes('name')) return '👤';
  if (lower.includes('phone')) return '📱';
  if (lower.includes('address')) return '📍';
  if (lower.includes('credit') || lower.includes('payment')) return '💳';
  if (lower.includes('social') || lower.includes('ssn')) return '🆔';
  if (lower.includes('date of birth') || lower.includes('dob')) return '🎂';
  return '📄';
}
