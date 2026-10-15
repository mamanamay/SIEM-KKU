import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { escapeHtml, reportFileName, withinReportDirectory } from './report-safety';
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { Attack } from "./entities/attack.entity";
import { Report } from "./entities/report.entity";
import { User } from "./entities/user.entity";
import * as puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import type { Response } from "express";

@Injectable()
export class ExportService {
  private activePdfs = 0;
  constructor(
    @InjectRepository(Attack) private attackRepository: Repository<Attack>,
    @InjectRepository(Report) private reportRepository: Repository<Report>,
    @InjectRepository(User) private userRepository: Repository<User>
  ) {
    const uploadDir = path.join(__dirname, "..", "uploads", "reports");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  }

  // -- PDF from HTML (frontend-generated ReportTemplate HTML) ---------------
  async generatePdfFromHtml(htmlContent: string, reportTitle?: string): Promise<Buffer> {
    if (typeof htmlContent !== 'string' || Buffer.byteLength(htmlContent) > 2 * 1024 * 1024) throw new BadRequestException('HTML exceeds 2 MiB');
    if (this.activePdfs >= 2) throw new ServiceUnavailableException('PDF capacity exhausted; retry later');
    this.activePdfs++;
    let browser: any;
    try {
      if (process.env.PDF_RENDER_URL) {
        if (process.env.PDF_RENDER_URL !== 'http://pdf-renderer:8200/render') throw new ServiceUnavailableException('Invalid PDF renderer configuration');
        const response = await fetch(process.env.PDF_RENDER_URL, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
          headers: { 'Content-Type': 'application/json', 'X-Render-Key': process.env.PDF_RENDER_KEY || '' },
          body: JSON.stringify({ htmlContent, reportTitle }),
        });
        if (!response.ok || !response.body) throw new ServiceUnavailableException('PDF renderer unavailable');
        const reader = response.body.getReader();
        const chunks: Buffer[] = []; let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.length;
            if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new ServiceUnavailableException('PDF output exceeds limit'); }
            chunks.push(Buffer.from(value));
          }
        } finally { reader.releaseLock(); }
        const result = Buffer.concat(chunks);
        if (result.subarray(0, 5).toString() !== '%PDF-') throw new ServiceUnavailableException('Invalid PDF renderer output');
        return result;
      }
      browser = await puppeteer.launch({
        headless: true,
        args: ["--disable-dev-shm-usage", "--disable-gpu"],
      });
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        if (request.url().startsWith('data:') || request.url() === 'about:blank') void request.continue();
        else void request.abort();
      });
      await page.setContent(htmlContent, { waitUntil: "load", timeout: 15000 });
      const pdf = await page.pdf({
        timeout: 15000,
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: `<div style="font-size:9px;color:#94a3b8;text-align:center;width:100%;padding:0 12mm;">KKU SIEM · ${escapeHtml(reportTitle || "Security Report")} · Page <span class='pageNumber'></span> of <span class='totalPages'></span></div>`,
      });
      return Buffer.from(pdf);
    } finally {
      try { if (browser) await browser.close(); } finally { this.activePdfs--; }
    }
  }

  // -- Legacy HTML report (kept for compat) ---------------------------------
  async generateHtmlReport(body: any): Promise<string> {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report</title></head><body><h1>${escapeHtml(body.reportTitle || "Security Report")}</h1></body></html>`;
  }

  // -- Legacy PDF (kept for compat) -----------------------------------------
  async generatePdfReport(body: any): Promise<Buffer> {
    const html = body.htmlContent || await this.generateHtmlReport(body);
    return this.generatePdfFromHtml(html, body.reportTitle);
  }

  // -- Get active users for Prepared By / Reviewed By dropdowns -------------
  async getActiveUsers(): Promise<Array<{ username: string; role: string; displayName?: string }>> {
    try {
      const users = await this.userRepository.find({ select: ["username", "role"] });
      return users.map(u => ({ username: u.username, role: u.role }));
    } catch {
      return [];
    }
  }

  // -- Get report history ----------------------------------------------------
  async getHistory() {
    return await this.reportRepository.find({ order: { generatedAt: "DESC" }, take:200,
      select:['id','reportId','reportVersion','title','type','format','language','sourcePage','author','preparedBy','reviewedBy','exportedBy','generatedAt','sha256Hash','selectedIpCount','selectedFieldCount','pageCount','contentDigest'] });
  }

  async getHistoryForUser(username: string) {
    return await this.reportRepository.find({ where: { author: username }, order: { generatedAt: "DESC" }, take:200,
      select:['id','reportId','reportVersion','title','type','format','language','sourcePage','author','preparedBy','reviewedBy','exportedBy','generatedAt','sha256Hash','selectedIpCount','selectedFieldCount','pageCount','contentDigest'] });
  }

  // -- Download report file --------------------------------------------------
  async downloadReport(id: number, res: Response, inline: boolean = false) {
    const report = await this.reportRepository.findOne({ where: { id } });
    if (!report) throw new NotFoundException("Report not found");
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (report.filePath && !withinReportDirectory(report.filePath, path.join(__dirname, '..', 'uploads', 'reports'))) throw new NotFoundException('Report path is invalid');
    if (!report.filePath || !fs.existsSync(report.filePath)) {
      if(report.format==='pdf')throw new NotFoundException('PDF file is unavailable');
      // Return summary as download if file missing
      const ext = report.format || "html";
      res.set({
        "Content-Type": ext === "pdf" ? "application/pdf" : ext === "csv" ? "text/csv" : "text/html",
        "Content-Disposition": 'attachment; filename="' + reportFileName(ext) + '"',
      });
      res.send(report.summary || "No content");
      return;
    }
    res.download(report.filePath);
  }

  // -- Save report history (called by legacy routes) -------------------------
  async saveReportHistory(body: any, format: string, fileBuffer: Buffer) {
    const fileName = reportFileName(format);
    const filePath = path.join(__dirname, "..", "uploads", "reports", fileName);
    fs.writeFileSync(filePath, fileBuffer);
    const report = this.reportRepository.create({
      title: body.reportTitle || "Custom Report",
      type: "custom", format, filePath,
      author: body.authorName || "System",
      summary: format !== "pdf" ? (body.htmlContent || "") : "PDF Content",
    });
    await this.reportRepository.save(report);
  }
}
