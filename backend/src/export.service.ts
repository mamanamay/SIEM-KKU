import { Injectable, NotFoundException } from "@nestjs/common";
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
  constructor(
    @InjectRepository(Attack) private attackRepository: Repository<Attack>,
    @InjectRepository(Report) private reportRepository: Repository<Report>,
    @InjectRepository(User) private userRepository: Repository<User>
  ) {
    const uploadDir = path.join(__dirname, "..", "uploads", "reports");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  }

  // ── PDF from HTML (frontend-generated ReportTemplate HTML) ───────────────
  async generatePdfFromHtml(htmlContent: string, reportTitle?: string): Promise<Buffer> {
    let browser: any;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle0", timeout: 30000 });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: `<div style="font-size:9px;color:#94a3b8;text-align:center;width:100%;padding:0 12mm;">KKU SIEM — ${reportTitle || "Security Report"} — Page <span class='pageNumber'></span> of <span class='totalPages'></span></div>`,
      });
      return Buffer.from(pdf);
    } finally {
      if (browser) await browser.close();
    }
  }

  // ── Legacy HTML report (kept for compat) ─────────────────────────────────
  async generateHtmlReport(body: any): Promise<string> {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report</title></head><body><h1>${body.reportTitle || "Security Report"}</h1></body></html>`;
  }

  // ── Legacy PDF (kept for compat) ─────────────────────────────────────────
  async generatePdfReport(body: any): Promise<Buffer> {
    const html = body.htmlContent || await this.generateHtmlReport(body);
    return this.generatePdfFromHtml(html, body.reportTitle);
  }

  // ── Get active users for Prepared By / Reviewed By dropdowns ─────────────
  async getActiveUsers(): Promise<Array<{ username: string; role: string; displayName?: string }>> {
    try {
      const users = await this.userRepository.find({ select: ["username", "role"] });
      return users.map(u => ({ username: u.username, role: u.role }));
    } catch {
      return [];
    }
  }

  // ── Get report history ────────────────────────────────────────────────────
  async getHistory() {
    return await this.reportRepository.find({ order: { generatedAt: "DESC" } });
  }

  async getHistoryForUser(username: string) {
    return await this.reportRepository.find({ where: { author: username }, order: { generatedAt: "DESC" } });
  }

  // ── Download report file ──────────────────────────────────────────────────
  async downloadReport(id: number, res: Response, inline: boolean = false) {
    const report = await this.reportRepository.findOne({ where: { id } });
    if (!report) throw new NotFoundException("Report not found");
    if (!report.filePath || !fs.existsSync(report.filePath)) {
      // Return summary as download if file missing
      const ext = report.format || "html";
      res.set({
        "Content-Type": ext === "pdf" ? "application/pdf" : ext === "csv" ? "text/csv" : "text/html",
        "Content-Disposition": `attachment; filename="${report.reportId || "report"}.${ext}"`,
      });
      res.send(report.summary || "No content");
      return;
    }
    res.download(report.filePath);
  }

  // ── Save report history (called by legacy routes) ─────────────────────────
  async saveReportHistory(body: any, format: string, fileBuffer: Buffer) {
    const fileName = `KKUSIEM_Report_${Date.now()}.${format}`;
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