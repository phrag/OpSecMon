import type { CyberServiceHandler } from '../../../../src/generated/server/worldmonitor/cyber/v1/service_server';

import { listCyberThreats } from './list-cyber-threats';
import { listRansomwareGroups } from './list-ransomware-groups';
import { listRansomwareVictims } from './list-ransomware-victims';
import { listCVEs } from './list-cves';
import { listBreaches } from './list-breaches';

export const cyberHandler: CyberServiceHandler = {
  listCyberThreats,
  listRansomwareGroups,
  listRansomwareVictims,
  listCVEs,
  listBreaches,
};
