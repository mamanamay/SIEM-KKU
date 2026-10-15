import { isIP } from 'net';
import { NetworkMapService } from './network-map.service';

/** Network ownership is defined by the registry, including registered public IPs. */
export function eventContext(event: any, map: NetworkMapService) {
  const endpoint = (ip: string | null) => {
    const family = ip ? isIP(ip) : 0;
    if (!family || ip === '0.0.0.0' || ip === '::') return { ip: null, scope: 'unknown', cidr: null, organization: null };
    const subnet = typeof map.findSubnet === 'function' ? map.findSubnet(ip) : null;
    const registered = typeof map.findSubnet === 'function' ? !!subnet : map.isInLan(ip);
    const privateAddress = family === 4 && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(ip!);
    const nonPublicV6 = family === 6 && /^(f[cd]|fe[89ab]|::1$)/i.test(ip!);
    return { ip, scope: registered ? 'organization' : privateAddress || nonPublicV6 ? 'unregistered_private' : 'outside_registered_network',
      cidr: subnet?.Route || null, organization: registered ? map.getOrganization(ip) : null };
  };
  const source = endpoint(event.src_ip || null), target = endpoint(event.dst_ip || null);
  const unresolved = [source.scope, target.scope].some(scope => ['unknown', 'unregistered_private'].includes(scope));
  const direction = unresolved ? 'unknown' : source.scope === 'organization'
    ? target.scope === 'organization' ? 'internal' : 'outbound'
    : target.scope === 'organization' ? 'inbound' : 'outside';
  return { source, target, direction, basis: 'configured_network_map',
    registry_revision: typeof map.getRevision === 'function' ? map.getRevision() : null };
}
