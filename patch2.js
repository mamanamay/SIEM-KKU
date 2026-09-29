const fs = require("fs");
let code = fs.readFileSync("backend/src/log.service.ts", "utf8");

const replacement = `  private async saveAndBroadcast(payload: any) {
    try {
      // --- [LAN Filter] ---
      // Requirement: Show ONLY IPs defined in networkmap
      const resolvedDestIp = payload.destIp || payload.dst_ip || '10.101.104.234';
      
      const isLanDest = this.networkMapService.isInLan(resolvedDestIp);
      const isLanSrc = this.networkMapService.isInLan(payload.ip);
      const isHoneypot = resolvedDestIp.startsWith('10.101.') || payload.ip.startsWith('10.101.') || resolvedDestIp === '127.0.0.1';
      
      if (!isLanDest && !isLanSrc && !isHoneypot) {
        return; // Silently drop external-to-external noise
      }
      
      const geo = geoip.lookup(payload.ip);`;

code = code.replace("  private async saveAndBroadcast(payload: any) {\r\n    try {\r\n      const geo = geoip.lookup(payload.ip);", replacement);
code = code.replace("  private async saveAndBroadcast(payload: any) {\n    try {\n      const geo = geoip.lookup(payload.ip);", replacement);

fs.writeFileSync("backend/src/log.service.ts", code, "utf8");
