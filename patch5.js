const fs = require("fs");
let code = fs.readFileSync("backend/src/attacks.controller.ts", "utf8");

const searchEndpoint = `
  // ── Search Attacks ────────────────────────────────────────────────────────
  @Get('search')
  @UseGuards(AuthGuard)
  async searchAttacks(
    @Query('q') q?: string,
    @Query('severity') severity?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('lan') lan?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(Math.max(1, parseInt(limit || '50', 10)), 200);
    const skip = (pageNum - 1) * limitNum;

    const qb = this.attackRepository.createQueryBuilder('a');

    if (q && q.trim()) {
      qb.andWhere(
        '(a.ip LIKE :q OR a.destIp LIKE :q OR a.type LIKE :q OR a.detail LIKE :q OR a.country LIKE :q)',
        { q: \`%\${q.trim()}%\` }
      );
    }
    if (severity) {
      qb.andWhere('a.severity = :severity', { severity });
    }

    if (lan === 'true') {
      qb.andWhere(
        \`(a.destIp LIKE '10.52.%' OR a.destIp LIKE '10.101.%' OR a.destIp = '127.0.0.1' OR
          a.ip LIKE '10.52.%' OR a.ip LIKE '10.101.%' OR a.ip = '127.0.0.1')\`
      );
    }

    qb.orderBy('a.id', 'DESC');

    const [data, total] = await qb.skip(skip).take(limitNum).getManyAndCount();

    return {
      data,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
    };
  }
`;

// It might be corrupted with thai characters "── IP History" so we use regex
code = code.replace(/@Get\('ip-history\/:ip'\)/, searchEndpoint + "\n\n  @Get('ip-history/:ip')");
fs.writeFileSync("backend/src/attacks.controller.ts", code, "utf8");
