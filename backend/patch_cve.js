const fs = require('fs');
let c = fs.readFileSync('src/cve.controller.ts', 'utf8');
const replacement = `return await this.cveHistoryRepo.save(history);
  }

  @Post('history/delete')
  async deleteHistory(@Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids)) throw new HttpException('Missing ids array', HttpStatus.BAD_REQUEST);
    return await this.cveHistoryRepo.createQueryBuilder().delete().from(CveHistory).where("cveId IN (:...ids)", { ids: body.ids }).execute();
  }`;
c = c.replace('return await this.cveHistoryRepo.save(history);\r\n  }', replacement);
c = c.replace('return await this.cveHistoryRepo.save(history);\n  }', replacement);
fs.writeFileSync('src/cve.controller.ts', c);
