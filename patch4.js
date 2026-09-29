const fs = require("fs");
let code = fs.readFileSync("backend/src/log.service.ts", "utf8");

const replacement = `  private async saveAndBroadcast(payload: any) {
    try {
      // --- STRICT LAN FILTER (Network Map Only) ---
      // Requirement: Show ONLY IPs strictly defined in networkmap (ip_records.json).
      // Drop logs where neither the source nor the destination is inside our LAN.
      
      const resolvedDestIp = payload.destIp || payload.dst_ip || '10.101.104.234';
      
      const isLanDest = this.networkMapService.isInLan(resolvedDestIp);
      const isLanSrc = this.networkMapService.isInLan(payload.ip);
      
      if (!isLanDest && !isLanSrc) {
        return; // Silently drop noise that isn't related to our strict network map
      }
      // --------------------------------------------
      
      const geo = geoip.lookup(payload.ip);`;

code = code.replace("  private async saveAndBroadcast(payload: any) {\r\n    try {\r\n      const geo = geoip.lookup(payload.ip);", replacement);
code = code.replace("  private async saveAndBroadcast(payload: any) {\n    try {\n      const geo = geoip.lookup(payload.ip);", replacement);

fs.writeFileSync("backend/src/log.service.ts", code, "utf8");
