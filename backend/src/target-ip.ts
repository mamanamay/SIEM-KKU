import { isIP } from 'node:net';
import { normalizeIp } from './developer-api/ip-policy';

export function targetIpFromEvent(data: any, allowAgentTarget = false): string {
  const candidates = [
    data?.destIp, data?.dest_ip, data?.dst_ip, data?.dstip, data?.destip,
    data?.destination_ip, data?.destination?.ip, data?.server_addr, data?.local_addr,
    data?.data?.dest_ip, data?.data?.dst_ip, data?.data?.dstip,
  ];
  const explicit = candidates.find(value => typeof value === 'string' && value.trim());
  const candidate = explicit ?? (allowAgentTarget ? data?.agent?.ip : '');
  const ip = normalizeIp(typeof candidate === 'string' ? candidate.trim() : '');
  return isIP(ip) ? ip : '';
}

export function targetIpFromRawLog(line: string): string {
  try {
    if (line.trim().startsWith('{')) return targetIpFromEvent(JSON.parse(line));
  } catch { return ''; }
  const match = line.match(/(?:^|\s)(?:dstip|dst_ip|destip|dest_ip|destIp|destination_ip|server_addr|local_addr)=["']?([^\s"']+)/);
  return match ? targetIpFromEvent({ dst_ip: match[1] }) : '';
}
