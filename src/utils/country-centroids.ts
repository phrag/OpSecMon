/**
 * Country centroids for map visualization.
 * Used to convert country codes to approximate coordinates for display.
 */

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US:[39.8,-98.6],CA:[56.1,-106.3],MX:[23.6,-102.6],BR:[-14.2,-51.9],AR:[-38.4,-63.6],
  GB:[55.4,-3.4],DE:[51.2,10.5],FR:[46.2,2.2],IT:[41.9,12.6],ES:[40.5,-3.7],
  NL:[52.1,5.3],BE:[50.5,4.5],SE:[60.1,18.6],NO:[60.5,8.5],FI:[61.9,25.7],
  DK:[56.3,9.5],PL:[51.9,19.1],CZ:[49.8,15.5],AT:[47.5,14.6],CH:[46.8,8.2],
  PT:[39.4,-8.2],IE:[53.1,-8.2],RO:[45.9,25.0],HU:[47.2,19.5],BG:[42.7,25.5],
  HR:[45.1,15.2],SK:[48.7,19.7],UA:[48.4,31.2],RU:[61.5,105.3],BY:[53.7,28.0],
  TR:[39.0,35.2],GR:[39.1,21.8],RS:[44.0,21.0],CN:[35.9,104.2],JP:[36.2,138.3],
  KR:[35.9,127.8],IN:[20.6,79.0],PK:[30.4,69.3],BD:[23.7,90.4],ID:[-0.8,113.9],
  TH:[15.9,101.0],VN:[14.1,108.3],PH:[12.9,121.8],MY:[4.2,101.9],SG:[1.4,103.8],
  TW:[23.7,121.0],HK:[22.4,114.1],AU:[-25.3,133.8],NZ:[-40.9,174.9],
  ZA:[-30.6,22.9],NG:[9.1,8.7],EG:[26.8,30.8],KE:[-0.02,37.9],ET:[9.1,40.5],
  MA:[31.8,-7.1],DZ:[28.0,1.7],TN:[33.9,9.5],GH:[7.9,-1.0],
  SA:[23.9,45.1],AE:[23.4,53.8],IL:[31.0,34.9],IR:[32.4,53.7],IQ:[33.2,43.7],
  KW:[29.3,47.5],QA:[25.4,51.2],BH:[26.0,50.6],JO:[30.6,36.2],LB:[33.9,35.9],
  CL:[-35.7,-71.5],CO:[4.6,-74.3],PE:[-9.2,-75.0],VE:[6.4,-66.6],
  KZ:[48.0,68.0],UZ:[41.4,64.6],GE:[42.3,43.4],AZ:[40.1,47.6],AM:[40.1,45.0],
  LT:[55.2,23.9],LV:[56.9,24.1],EE:[58.6,25.0],
  HN:[15.2,-86.2],GT:[15.8,-90.2],PA:[8.5,-80.8],CR:[9.7,-84.0],
  SN:[14.5,-14.5],CM:[7.4,12.4],CI:[7.5,-5.5],TZ:[-6.4,34.9],UG:[1.4,32.3],
  KP:[40.3,127.5],
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'russia': 'RU',
  'china': 'CN',
  'north korea': 'KP',
  'iran': 'IR',
  'vietnam': 'VN',
  'israel': 'IL',
  'united states': 'US',
  'usa': 'US',
  'united kingdom': 'GB',
  'uk': 'GB',
  'germany': 'DE',
  'france': 'FR',
  'india': 'IN',
  'pakistan': 'PK',
  'japan': 'JP',
  'south korea': 'KR',
  'korea': 'KR',
  'brazil': 'BR',
  'australia': 'AU',
  'canada': 'CA',
  'mexico': 'MX',
  'turkey': 'TR',
  'saudi arabia': 'SA',
  'uae': 'AE',
  'united arab emirates': 'AE',
  'egypt': 'EG',
  'south africa': 'ZA',
  'nigeria': 'NG',
  'indonesia': 'ID',
  'malaysia': 'MY',
  'thailand': 'TH',
  'philippines': 'PH',
  'singapore': 'SG',
  'taiwan': 'TW',
  'hong kong': 'HK',
  'ukraine': 'UA',
  'poland': 'PL',
  'spain': 'ES',
  'italy': 'IT',
  'netherlands': 'NL',
  'belgium': 'BE',
  'sweden': 'SE',
  'norway': 'NO',
  'finland': 'FI',
  'denmark': 'DK',
  'switzerland': 'CH',
  'austria': 'AT',
  'portugal': 'PT',
  'ireland': 'IE',
  'greece': 'GR',
  'romania': 'RO',
  'hungary': 'HU',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'peru': 'PE',
  'venezuela': 'VE',
  'iraq': 'IQ',
  'kuwait': 'KW',
  'qatar': 'QA',
  'bahrain': 'BH',
  'jordan': 'JO',
  'lebanon': 'LB',
  'kenya': 'KE',
  'ethiopia': 'ET',
  'morocco': 'MA',
  'algeria': 'DZ',
  'tunisia': 'TN',
  'ghana': 'GH',
  'kazakhstan': 'KZ',
  'uzbekistan': 'UZ',
  'georgia': 'GE',
  'azerbaijan': 'AZ',
  'armenia': 'AM',
  'lithuania': 'LT',
  'latvia': 'LV',
  'estonia': 'EE',
  'serbia': 'RS',
  'croatia': 'HR',
  'slovakia': 'SK',
  'bulgaria': 'BG',
  'belarus': 'BY',
  'bangladesh': 'BD',
  'new zealand': 'NZ',
};

function djb2(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) & 0xffffffff;
  return h;
}

export function getCountryCode(countryNameOrCode: string): string | null {
  if (!countryNameOrCode) return null;
  const upper = countryNameOrCode.toUpperCase();
  if (COUNTRY_CENTROIDS[upper]) return upper;
  const lower = countryNameOrCode.toLowerCase();
  return COUNTRY_NAME_TO_CODE[lower] || null;
}

export function getCountryCentroid(
  countryNameOrCode: string, 
  seed?: string
): { lat: number; lon: number } | null {
  const code = getCountryCode(countryNameOrCode);
  if (!code) return null;
  const coords = COUNTRY_CENTROIDS[code];
  if (!coords) return null;
  const key = seed || code;
  const latOffset = (((djb2(key) & 0xffff) / 0xffff) - 0.5) * 2;
  const lonOffset = (((djb2(key + ':lon') & 0xffff) / 0xffff) - 0.5) * 2;
  return { lat: coords[0] + latOffset, lon: coords[1] + lonOffset };
}
