import { createCircuitBreaker } from '@/utils';

export interface RansomwareGroup {
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

export interface RansomwareVictim {
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

interface ListRansomwareGroupsResponse {
  groups: RansomwareGroup[];
  totalCount: number;
  nextCursor: string;
}

interface ListRansomwareVictimsResponse {
  victims: RansomwareVictim[];
  totalCount: number;
  nextCursor: string;
}

const groupsBreaker = createCircuitBreaker<ListRansomwareGroupsResponse>({
  name: 'Ransomware Groups',
  cacheTtlMs: 30 * 60 * 1000,
  persistCache: true,
});

const victimsBreaker = createCircuitBreaker<ListRansomwareVictimsResponse>({
  name: 'Ransomware Victims',
  cacheTtlMs: 15 * 60 * 1000,
  persistCache: true,
});

const emptyGroups: ListRansomwareGroupsResponse = { groups: [], totalCount: 0, nextCursor: '' };
const emptyVictims: ListRansomwareVictimsResponse = { victims: [], totalCount: 0, nextCursor: '' };

export async function fetchRansomwareGroups(options: {
  activeDays?: number;
  pageSize?: number;
  cursor?: string;
} = {}): Promise<ListRansomwareGroupsResponse> {
  const params = new URLSearchParams();
  if (options.activeDays) params.set('active_days', String(options.activeDays));
  if (options.pageSize) params.set('page_size', String(options.pageSize));
  if (options.cursor) params.set('cursor', options.cursor);

  const resp = await groupsBreaker.execute(async () => {
    const response = await fetch(`/api/cyber/v1/list-ransomware-groups?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<ListRansomwareGroupsResponse>;
  }, emptyGroups);

  return resp;
}

export async function fetchRansomwareVictims(options: {
  group?: string;
  days?: number;
  pageSize?: number;
  cursor?: string;
} = {}): Promise<ListRansomwareVictimsResponse> {
  const params = new URLSearchParams();
  if (options.group) params.set('group', options.group);
  if (options.days) params.set('days', String(options.days));
  if (options.pageSize) params.set('page_size', String(options.pageSize));
  if (options.cursor) params.set('cursor', options.cursor);

  const resp = await victimsBreaker.execute(async () => {
    const response = await fetch(`/api/cyber/v1/list-ransomware-victims?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<ListRansomwareVictimsResponse>;
  }, emptyVictims);

  return resp;
}
