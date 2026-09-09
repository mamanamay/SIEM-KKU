import { Controller, Post, Body, Res, Get, Param, Delete, UseGuards, HttpException, HttpStatus, Request, Query } from "@nestjs/common";
import type { Response } from "express";
import { ExportService } from "./export.service";
import { AiService } from "./ai.service";
import { AuthGuard } from "./auth.guard";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Report } from "./entities/report.entity";
import { ExportAudit } from "./entities/export-audit.entity";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

@Controller("api/export")
export class ExportController {

  constructor(
    private readonly exportService: ExportService,
    private readonly aiService: AiService,
    @InjectRepository(Report) private reportRepository: Repository<Report>,
    @InjectRepository(ExportAudit) private auditRepository: Repository<ExportAudit>
  ) {}

  // ── SAVE HISTORY (called after any successful export) ─────────────────────
  @Post("save-history")
  @UseGuards(AuthGuard)
  async saveHistory(@Body() body: any, @Request() req: any) {
    const format = body.format || "html";
    const content = body.content || "";
    const contentBuffer = Buffer.from(content, "utf-8");

    // Compute SHA-256 of content
    const sha256Hash = crypto.createHash("sha256").update(contentBuffer).digest("hex");

    const fileName = body.fileName || `KKUSIEM_Report_${Date.now()}.${format}`;
    const filePath = path.join(__dirname, "..", "uploads", "reports", fileName);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, contentBuffer);

    const report = this.reportRepository.create({
      reportId: body.reportId,
      reportVersion: body.reportVersion || "v1.0",
      title: body.reportTitle || "Security Report",
      type: body.reportType || "custom",
      format,
      language: body.language || "th",
      sourcePage: body.sourcePage || body.pageType || "unknown",
      filePath,
      author: body.preparedBy || body.authorName || req.user?.username || "System",
      preparedBy: body.preparedBy || body.authorName,
      reviewedBy: body.reviewedBy,
      exportedBy: req.user?.username || body.exportedBy || "unknown",
      summary: format !== "pdf" ? content : "PDF Content",
      sha256Hash,
      selectedIpCount: body.selectedIpCount ?? 0,
      selectedFieldCount: body.selectedFieldCount ?? 0,
      revisionHistoryJson: body.revisionHistoryJson || null,
    });
    await this.reportRepository.save(report);

    // Audit log
    await this.auditRepository.save(this.auditRepository.create({
      action: "EXPORT_REPORT",
      reportId: body.reportId,
      reportTitle: body.reportTitle,
      reportType: body.reportType,
      language: body.language,
      fileFormat: format,
      sourcePage: body.sourcePage || body.pageType,
      exportedBy: req.user?.username || body.exportedBy || "unknown",
      exportedByRole: req.user?.role || "unknown",
      selectedIpCount: body.selectedIpCount ?? 0,
      selectedFieldCount: body.selectedFieldCount ?? 0,
      status: "SUCCESS",
      sha256Hash,
    }));

    return { success: true, id: report.id, reportId: report.reportId, sha256Hash, generatedAt: report.generatedAt };
  }

  // ── AI VALIDATE REPORT ────────────────────────────────────────────────────
  @Post("validate")
  async validateReport(@Body() body: any) {
    const { content, reportData } = body;
    const issues: any[] = [];

    // 1. Basic data consistency check
    if (reportData) {
      const stated = reportData.statedEventCount;
      const actual = reportData.actualEventCount;
      if (stated !== undefined && actual !== undefined && stated !== actual) {
        issues.push({
          level: "error",
          category: "data_consistency",
          message: `Event count mismatch: report states ${stated} but actual data has ${actual} events`,
          detail: `Stated: ${stated}, Actual: ${actual}`
        });
      }

      // IP duplicate record check
      if (reportData.events) {
        const eventMap: Record<string, number> = {};
        for (const e of reportData.events) {
          const key = `${e.id}-${e.createdAt}-${e.ip}`;
          eventMap[key] = (eventMap[key] || 0) + 1;
        }
        const duplicates = Object.entries(eventMap).filter(([, c]) => c > 1);
        if (duplicates.length > 0) {
          issues.push({
            level: "warning",
            category: "duplicate_record",
            message: `Found ${duplicates.length} duplicate event record(s)`,
            detail: "These are exact duplicate entries (same ID, timestamp, and IP) — not repeated attacker activity"
          });
        }
      }
    }

    // 2. Language check — call AI if possible
    let aiResult: any = null;
    try {
      aiResult = await this.aiService.validateReportContent(content || "", reportData);
      if (aiResult?.issues) {
        issues.push(...aiResult.issues);
      }
    } catch (e) {
      // AI validation unavailable — report as info
      issues.push({ level: "info", category: "language", message: "AI language check unavailable", detail: "AI service is offline" });
    }

    const hasCritical = issues.some(i => i.level === "error");
    const passed = !hasCritical && issues.filter(i => i.level === "warning").length === 0;

    return {
      passed,
      hasCritical,
      issues,
      checkedAt: new Date().toISOString()
    };
  }

  // ── PDF EXPORT (new engine: html-pdf / jsPDF via backend) ─────────────────
  @Post("pdf")
  async exportPdf(@Body() body: any, @Res() res: Response, @Request() req: any) {
    try {
      const { htmlContent, reportTitle, reportId, reportVersion, reportType, language,
              preparedBy, reviewedBy, exportedBy, sourcePage, selectedIpCount, selectedFieldCount } = body;
      if (!htmlContent) { res.status(400).json({ error: "No HTML content provided" }); return; }

      const pdfBuffer = await this.exportService.generatePdfFromHtml(htmlContent, reportTitle);
      const sha256Hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

      // Save to history
      const fileName = `${reportId || "RPT"}_${Date.now()}.pdf`;
      const filePath = path.join(__dirname, "..", "uploads", "reports", fileName);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, pdfBuffer);

      const report = this.reportRepository.create({
        reportId, reportVersion: reportVersion || "v1.0",
        title: reportTitle || "Security Report",
        type: reportType || "executive", format: "pdf", language, sourcePage,
        filePath, author: preparedBy || exportedBy,
        preparedBy, reviewedBy,
        exportedBy: req.user?.username || exportedBy || "unknown",
        summary: "PDF Content", sha256Hash,
        selectedIpCount: selectedIpCount ?? 0, selectedFieldCount: selectedFieldCount ?? 0,
      });
      await this.reportRepository.save(report);

      // Audit
      await this.auditRepository.save(this.auditRepository.create({
        action: "EXPORT_REPORT", reportId, reportTitle, reportType, language,
        fileFormat: "pdf", sourcePage,
        exportedBy: req.user?.username || exportedBy || "unknown",
        exportedByRole: req.user?.role || "unknown",
        selectedIpCount: selectedIpCount ?? 0, selectedFieldCount: selectedFieldCount ?? 0,
        status: "SUCCESS", sha256Hash,
      }));

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportId || "report"}_${new Date().toISOString().slice(0,10)}.pdf"`,
        "Content-Length": pdfBuffer.length,
        "X-Report-Hash": sha256Hash,
      });
      res.end(pdfBuffer);
    } catch (e: any) {
      console.error("[PDF Export Error]", e);
      res.status(500).json({ error: "Failed to generate PDF", detail: e?.message });
    }
  }

  // ── AI GENERATE NARRATIVE ────────────────────────────────────────────────
  @Post("ai-generate")
  async aiGenerateReport(@Body() body: any) {
    const { events, reportType, language } = body;
    if (!events || !Array.isArray(events)) throw new HttpException("Invalid events data", HttpStatus.BAD_REQUEST);
    const result = await this.aiService.generateReportNarrative(events, reportType, language);
    return result;
  }

  // ── AI PROOFREAD ─────────────────────────────────────────────────────────
  @Post("proofread")
  async proofreadReport(@Body() body: any) {
    const { text } = body;
    if (!text) throw new HttpException("No text provided", HttpStatus.BAD_REQUEST);
    const result = await this.aiService.proofreadReport(text);
    return result;
  }

  // ── GET USER LIST (for Prepared By / Reviewed By dropdowns) ──────────────
  @Get("users")
  @UseGuards(AuthGuard)
  async getUsers() {
    return await this.exportService.getActiveUsers();
  }

  // ── GET HISTORY ───────────────────────────────────────────────────────────
  @Get("history")
  async getHistory() {
    return await this.exportService.getHistory();
  }

  // ── DOWNLOAD FILE ─────────────────────────────────────────────────────────
  @Get("download/:id")
  async downloadReport(@Param("id") id: number, @Res() res: Response, @Query("inline") inline?: string) {
    await this.exportService.downloadReport(id, res, inline === "true");
  }

  // ── DELETE REPORT ─────────────────────────────────────────────────────────
  @Delete(":id")
  @UseGuards(AuthGuard)
  async deleteReport(@Param("id") id: number, @Request() req: any) {
    const report = await this.reportRepository.findOne({ where: { id: +id } });
    if (!report) throw new HttpException("Report not found", HttpStatus.NOT_FOUND);
    if (req.user?.role !== "admin" && report.exportedBy !== req.user?.username) {
      throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);
    }
    await this.reportRepository.remove(report);
    return { success: true };
  }
}