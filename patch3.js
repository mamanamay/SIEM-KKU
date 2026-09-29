const fs = require("fs");
let code = fs.readFileSync("backend/src/log.service.ts", "utf8");

// Remove the strict isLanRelated block
const badBlockRegex = /let isLanRelated = false;\s*for \(const ip of ips\) \{\s*if \(ip !== '127\.0\.0\.1' && ip !== '0\.0\.0\.0' && this\.networkMapService\.isInLan\(ip\)\) \{\s*isLanRelated = true;\s*break;\s*\}\s*\}\s*\/\/ Drop log if it's not related to our LAN[^\n]*\n\s*if \(!isLanRelated\) \{\s*return;\s*\}/g;

code = code.replace(badBlockRegex, "// Removed strict isLanRelated check. saveAndBroadcast will handle it.");

fs.writeFileSync("backend/src/log.service.ts", code, "utf8");
