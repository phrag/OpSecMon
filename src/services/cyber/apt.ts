import aptGroupsData from '@/data/apt-groups.json';

export interface APTGroup {
  id: string;
  name: string;
  aliases: string[];
  attribution: string;
  description: string;
  targetSectors: string[];
  targetRegions: string[];
  ttps: string[];
  lastActive: string;
  activityLevel?: 'very_high' | 'high' | 'medium' | 'low';
  knownBreaches?: string[];
}

interface APTGroupsData {
  groups: APTGroup[];
  lastUpdated: string;
  source: string;
}

const data = aptGroupsData as APTGroupsData;

export function getAPTGroups(): APTGroup[] {
  return data.groups;
}

export function getAPTGroupByName(name: string): APTGroup | undefined {
  const lowerName = name.toLowerCase();
  return data.groups.find(g => 
    g.name.toLowerCase() === lowerName ||
    g.aliases.some(a => a.toLowerCase() === lowerName)
  );
}

export function getAPTGroupsByAttribution(attribution: string): APTGroup[] {
  const lowerAttr = attribution.toLowerCase();
  return data.groups.filter(g => g.attribution.toLowerCase() === lowerAttr);
}

export function getAPTGroupsBySector(sector: string): APTGroup[] {
  const lowerSector = sector.toLowerCase();
  return data.groups.filter(g => 
    g.targetSectors.some(s => s.toLowerCase().includes(lowerSector))
  );
}

export function searchAPTGroups(query: string): APTGroup[] {
  const lowerQuery = query.toLowerCase();
  return data.groups.filter(g =>
    g.name.toLowerCase().includes(lowerQuery) ||
    g.aliases.some(a => a.toLowerCase().includes(lowerQuery)) ||
    g.attribution.toLowerCase().includes(lowerQuery) ||
    g.description.toLowerCase().includes(lowerQuery)
  );
}

export function getAttributionColor(attribution: string): string {
  switch (attribution.toLowerCase()) {
    case 'russia': return '#dc3545';
    case 'china': return '#fd7e14';
    case 'north korea': return '#6f42c1';
    case 'iran': return '#20c997';
    case 'vietnam': return '#17a2b8';
    case 'cybercrime': return '#e83e8c';
    default: return '#6c757d';
  }
}

export function getDataLastUpdated(): string {
  return data.lastUpdated;
}
