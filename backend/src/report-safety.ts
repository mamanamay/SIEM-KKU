import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export function reportFileName(format: string): string {
  if (!['pdf', 'html', 'csv'].includes(format)) throw new BadRequestException('Invalid report format');
  return 'KKUSIEM_' + randomUUID() + '.' + format;
}
export function withinReportDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
