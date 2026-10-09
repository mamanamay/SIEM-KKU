import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** PATs are deliberately never credentials for existing browser/admin/ingest routes. */
@Injectable()
export class ApiBoundaryMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (/^Bearer kkusiem_pat_/i.test(req.headers.authorization || '') && !/^\/api\/v1(?:\/|$)/.test(req.originalUrl.split('?')[0])) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(403).json({ statusCode: 403, message: 'Developer tokens are restricted to /api/v1 read-only APIs' });
    }
    return next();
  }
}
