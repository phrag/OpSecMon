// Cyber/OSINT variant - cyber.worldmonitor.app
import type { PanelConfig, MapLayers } from '@/types';
import type { VariantConfig } from './base';

// Re-export base config
export * from './base';

// Cyber-specific exports
export {
  SOURCE_TIERS,
  getSourceTier,
  SOURCE_TYPES,
  getSourceType,
  getSourcePropagandaRisk,
  type SourceRiskProfile,
  type SourceType,
} from '../feeds';

// Cyber-specific FEEDS configuration
import type { Feed } from '@/types';
import { rssProxyUrl } from '@/utils';

const rss = rssProxyUrl;

export const FEEDS: Record<string, Feed[]> = {
  // Security panel feeds (used by NewsPanel with key 'security')
  security: [
    { name: 'Krebs on Security', url: rss('https://krebsonsecurity.com/feed/') },
    { name: 'The Hacker News', url: rss('https://feeds.feedburner.com/TheHackersNews') },
    { name: 'Dark Reading', url: rss('https://www.darkreading.com/rss.xml') },
    { name: 'Schneier on Security', url: rss('https://www.schneier.com/feed/') },
    { name: 'SecurityWeek', url: rss('https://feeds.feedburner.com/securityweek') },
  ],

  // Cybersecurity News
  cyber: [
    { name: 'Krebs on Security', url: rss('https://krebsonsecurity.com/feed/') },
    { name: 'The Hacker News', url: rss('https://feeds.feedburner.com/TheHackersNews') },
    { name: 'Bleeping Computer', url: rss('https://www.bleepingcomputer.com/feed/') },
    { name: 'Dark Reading', url: rss('https://www.darkreading.com/rss.xml') },
    { name: 'SecurityWeek', url: rss('https://feeds.feedburner.com/securityweek') },
    { name: 'Threatpost', url: rss('https://threatpost.com/feed/') },
    { name: 'SC Magazine', url: rss('https://www.scmagazine.com/feed') },
    { name: 'CSO Online', url: rss('https://www.csoonline.com/feed/') },
    { name: 'Infosecurity Magazine', url: rss('https://www.infosecurity-magazine.com/rss/news/') },
    { name: 'Naked Security', url: rss('https://nakedsecurity.sophos.com/feed/') },
  ],

  // Threat Intelligence
  threatIntel: [
    { name: 'CISA Alerts', url: rss('https://www.cisa.gov/uscert/ncas/alerts.xml') },
    { name: 'US-CERT', url: rss('https://www.cisa.gov/uscert/ncas/current-activity.xml') },
    { name: 'NIST NVD', url: rss('https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml') },
    { name: 'Recorded Future', url: rss('https://www.recordedfuture.com/feed') },
    { name: 'Mandiant Blog', url: rss('https://www.mandiant.com/resources/blog/rss.xml') },
    { name: 'CrowdStrike', url: rss('https://www.crowdstrike.com/blog/feed/') },
    { name: 'Unit 42', url: rss('https://unit42.paloaltonetworks.com/feed/') },
    { name: 'Talos Intel', url: rss('https://blog.talosintelligence.com/feeds/posts/default') },
    { name: 'SentinelOne', url: rss('https://www.sentinelone.com/feed/') },
  ],

  // OSINT & Research
  osint: [
    { name: 'Bellingcat', url: rss('https://www.bellingcat.com/feed/') },
    { name: 'Intel471', url: rss('https://intel471.com/blog/feed/') },
    { name: 'Flashpoint', url: rss('https://flashpoint.io/feed/') },
    { name: 'RiskIQ', url: rss('https://community.riskiq.com/blog/rss') },
    { name: 'GreyNoise', url: rss('https://www.greynoise.io/blog/rss.xml') },
    { name: 'Binary Defense', url: rss('https://www.binarydefense.com/feed/') },
    { name: 'Team Cymru', url: rss('https://team-cymru.com/blog/feed/') },
  ],

  // Ransomware & Malware
  malware: [
    { name: 'Malwarebytes Labs', url: rss('https://blog.malwarebytes.com/feed/') },
    { name: 'Any.Run', url: rss('https://any.run/cybersecurity-blog/feed/') },
    { name: 'Virus Bulletin', url: rss('https://www.virusbulletin.com/rss') },
    { name: 'MalwareTech', url: rss('https://www.malwaretech.com/feed') },
    { name: 'Reversing Labs', url: rss('https://blog.reversinglabs.com/rss.xml') },
  ],

  // Government & Policy
  govCyber: [
    { name: 'FBI Cyber', url: rss('https://www.fbi.gov/feeds/fbi-cyber-division-news/rss.xml') },
    { name: 'NSA Cybersecurity', url: rss('https://www.nsa.gov/rss/press-releases.xml') },
    { name: 'NCSC UK', url: rss('https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml') },
    { name: 'ENISA', url: rss('https://www.enisa.europa.eu/rss') },
    { name: 'ACSC Australia', url: rss('https://www.cyber.gov.au/rss/acsc-news.xml') },
  ],

  // Vulnerability Research
  vulnResearch: [
    { name: 'Project Zero', url: rss('https://googleprojectzero.blogspot.com/feeds/posts/default') },
    { name: 'Zero Day Initiative', url: rss('https://www.zerodayinitiative.com/rss/published/') },
    { name: 'Packet Storm', url: rss('https://rss.packetstormsecurity.com/') },
    { name: 'Exploit Database', url: rss('https://www.exploit-db.com/rss.xml') },
    { name: 'Full Disclosure', url: rss('https://seclists.org/rss/fulldisclosure.rss') },
  ],
};

// Cyber-focused panels
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  // Core cyber intelligence panels
  'cyber-threats': { name: 'Cyber Threats', enabled: true, priority: 1 },
  'ransomware': { name: 'Ransomware Tracker', enabled: true, priority: 1 },
  'cve-feed': { name: 'CVE Feed', enabled: true, priority: 1 },
  'apt-groups': { name: 'APT Groups', enabled: true, priority: 1 },
  'data-breaches': { name: 'Data Breaches', enabled: true, priority: 1 },
  'osint': { name: 'OSINT Feed', enabled: true, priority: 1 },

  // Supporting panels
  'live-news': { name: 'Cyber News', enabled: true, priority: 1 },
  'security': { name: 'Cybersecurity', enabled: true, priority: 2 },
  'outages': { name: 'Internet Outages', enabled: true, priority: 2 },
  'gdelt-intel': { name: 'Threat Intelligence', enabled: true, priority: 2 },
  'telegram-intel': { name: 'Telegram Intel', enabled: true, priority: 2 },

  // Infrastructure monitoring
  'cascade': { name: 'Infrastructure Cascade', enabled: true, priority: 2 },

  // User features
  monitors: { name: 'My Monitors', enabled: true, priority: 2 },
};

// Cyber-focused map layers
export const DEFAULT_MAP_LAYERS: MapLayers = {
  gpsJamming: true,
  satellites: false,

  conflicts: false,
  bases: false,
  cables: true,
  pipelines: false,
  hotspots: true,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  weather: false,
  economic: false,
  waterways: false,
  outages: true,
  cyberThreats: true,
  datacenters: true,
  protests: false,
  flights: false,
  military: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  // Tech layers (disabled in cyber variant)
  startupHubs: false,
  cloudRegions: true,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  // Finance layers (disabled in cyber variant)
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  // Happy variant layers
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  iranAttacks: false,
  ciiChoropleth: false,
  dayNight: false,
  // Commodity variant layers (disabled in cyber variant)
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
  // Cyber intelligence layers (enabled!)
  ransomwareVictims: true,
  aptGroups: true,
};

// Mobile defaults for cyber variant
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = {
  gpsJamming: false,
  satellites: false,

  conflicts: false,
  bases: false,
  cables: false,
  pipelines: false,
  hotspots: true,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  weather: false,
  economic: false,
  waterways: false,
  outages: true,
  cyberThreats: true,
  datacenters: false,
  protests: false,
  flights: false,
  military: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  // Tech layers (disabled)
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  // Finance layers (disabled)
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  // Happy variant layers
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  iranAttacks: false,
  ciiChoropleth: false,
  dayNight: false,
  // Commodity variant layers
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
  // Cyber intelligence layers
  ransomwareVictims: true,
  aptGroups: false,
};

export const VARIANT_CONFIG: VariantConfig = {
  name: 'cyber',
  description: 'Cybersecurity, threat intelligence & OSINT dashboard',
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
