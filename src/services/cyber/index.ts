import type {
  CyberThreat,
  CyberThreatType,
  CyberThreatSource,
  CyberThreatSeverity,
  CyberThreatIndicatorType,
} from '@/types';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';

interface ListCyberThreatsResponse {
  threats: CyberThreat[];
  totalCount: number;
  nextCursor: string;
}

const breaker = createCircuitBreaker<ListCyberThreatsResponse>({
  name: 'Cyber Threats',
  cacheTtlMs: 10 * 60 * 1000,
  persistCache: true,
});

const emptyFallback: ListCyberThreatsResponse = { threats: [], totalCount: 0, nextCursor: '' };

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

function clampInt(rawValue: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(rawValue)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(rawValue as number)));
}

function normalizeType(type: string): CyberThreatType {
  switch (type) {
    case 'c2_server': return 'c2_server';
    case 'malware_host': return 'malware_host';
    case 'phishing': return 'phishing';
    case 'malicious_url': return 'malicious_url';
    default: return 'malicious_url';
  }
}

function normalizeSource(source: string): CyberThreatSource {
  switch (source) {
    case 'feodo': return 'feodo';
    case 'urlhaus': return 'urlhaus';
    case 'c2intel': return 'c2intel';
    case 'otx': return 'otx';
    case 'abuseipdb': return 'abuseipdb';
    default: return 'feodo';
  }
}

function normalizeSeverity(severity: string): CyberThreatSeverity {
  switch (severity) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return 'medium';
  }
}

function normalizeIndicatorType(indicatorType: string): CyberThreatIndicatorType {
  switch (indicatorType) {
    case 'ip': return 'ip';
    case 'domain': return 'domain';
    case 'url': return 'url';
    default: return 'ip';
  }
}

function toNormalizedThreat(raw: Record<string, unknown>): CyberThreat {
  return {
    id: String(raw.id || ''),
    type: normalizeType(String(raw.type || '')),
    source: normalizeSource(String(raw.source || '')),
    indicator: String(raw.indicator || ''),
    indicatorType: normalizeIndicatorType(String(raw.indicatorType || '')),
    lat: typeof raw.lat === 'number' ? raw.lat : 0,
    lon: typeof raw.lon === 'number' ? raw.lon : 0,
    country: raw.country ? String(raw.country) : undefined,
    severity: normalizeSeverity(String(raw.severity || '')),
    malwareFamily: raw.malwareFamily ? String(raw.malwareFamily) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    firstSeen: raw.firstSeen ? String(raw.firstSeen) : undefined,
    lastSeen: raw.lastSeen ? String(raw.lastSeen) : undefined,
  };
}

export async function fetchCyberThreats(options: { limit?: number; days?: number } = {}): Promise<CyberThreat[]> {
  const hydrated = getHydratedData('cyberThreats') as { threats?: Record<string, unknown>[] } | undefined;
  if (hydrated?.threats?.length) {
    return hydrated.threats.map(toNormalizedThreat);
  }

  const limit = clampInt(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const days = clampInt(options.days, DEFAULT_DAYS, 1, MAX_DAYS);

  const params = new URLSearchParams();
  params.set('page_size', String(limit));
  params.set('days', String(days));

  const resp = await breaker.execute(async () => {
    const response = await fetch(`/api/cyber/v1/list-cyber-threats?${params}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { threats: Record<string, unknown>[]; totalCount: number; nextCursor: string };
    return {
      threats: data.threats.map(toNormalizedThreat),
      totalCount: data.totalCount,
      nextCursor: data.nextCursor,
    };
  }, emptyFallback);

  return resp.threats;
}
