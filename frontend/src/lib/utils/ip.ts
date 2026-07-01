/**
 * Converts an IPv4 address string (e.g., '192.168.1.1') to a 32-bit unsigned integer.
 * @param ip IPv4 string
 * @returns 32-bit integer or 0 if invalid
 */
export function ipToLong(ip: string): number {
  if (!ip) return 0;
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  
  return parts.reduce((acc, octet) => {
    const val = parseInt(octet, 10);
    if (isNaN(val) || val < 0 || val > 255) return acc;
    return (acc << 8) + val;
  }, 0) >>> 0;
}

/**
 * Checks if a given IPv4 address falls within a CIDR subnet.
 * @param ip IPv4 address (e.g., '10.199.10.223')
 * @param cidr CIDR notation (e.g., '10.199.0.0/16')
 * @returns boolean true if IP is in subnet
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;
  
  try {
    const [subnet, maskStr] = cidr.split('/');
    const mask = parseInt(maskStr, 10);
    
    // If no mask is provided, perform an exact string match (treat as /32)
    if (isNaN(mask)) {
      return ip === cidr;
    }
    
    const ipLong = ipToLong(ip);
    const subnetLong = ipToLong(subnet);
    
    // Create the bitmask for the subnet
    // Example: /16 -> 11111111 11111111 00000000 00000000 -> 0xFFFF0000
    // Shifting 0xFFFFFFFF by (32 - mask)
    const maskLong = (0xffffffff << (32 - mask)) >>> 0;
    
    return (ipLong & maskLong) === (subnetLong & maskLong);
  } catch (e) {
    return false;
  }
}
