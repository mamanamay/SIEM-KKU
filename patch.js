const fs = require("fs");
let code = fs.readFileSync("backend/src/log.service.ts", "utf8");

const limitFunc = `
  // [MEMORY LEAK FIX] Helper to immediately delete oldest items when limit is reached
  private enforceMapLimit(map: Map<any, any>, limit: number = 10000) {
    if (map.size > limit) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
  }

  constructor(`;

code = code.replace("  constructor(", limitFunc);
code = code.replace(/this\.ingestHealth\.set\(([^)]+)\);/g, "this.ingestHealth.set($1); this.enforceMapLimit(this.ingestHealth, 50);");
code = code.replace(/this\.sessionToIpMap\.set\(([^)]+)\);/g, "this.sessionToIpMap.set($1); this.enforceMapLimit(this.sessionToIpMap, 5000);");
code = code.replace(/this\.ipStats\.set\(([^)]+)\);/g, "this.ipStats.set($1); this.enforceMapLimit(this.ipStats, 5000);");
code = code.replace(/this\.aggregationCache\.set\(([^)]+)\);/g, "this.aggregationCache.set($1); this.enforceMapLimit(this.aggregationCache, 5000);");

fs.writeFileSync("backend/src/log.service.ts", code, "utf8");
