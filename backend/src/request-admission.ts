import type { Request, Response, NextFunction } from 'express';
import { MAX_HTTP_BODY_REQUESTS } from './runtime-limits';

/** Reserve before body-parser; rejected bodies never enter a process-local queue. */
export class RequestAdmission {
  private active = 0;
  private rejected = 0;
  constructor(private readonly limit = MAX_HTTP_BODY_REQUESTS) {}
  readonly use = (req: Request, res: Response, next: NextFunction) => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
    if (this.active >= this.limit) {
      this.rejected++;
      res.setHeader('Retry-After', '2');
      res.status(503).json({ statusCode: 503, message: 'Request capacity full; retry later' });
      return;
    }
    this.active++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active--;
      res.removeListener('finish', release);
      res.removeListener('close', release);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
  diagnostics() { return { activeBodyRequests: this.active, maxBodyRequests: this.limit, rejectedBodyRequests: this.rejected }; }
}
export const requestAdmission = new RequestAdmission();
