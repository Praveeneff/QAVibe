import { Controller, Get, UseGuards } from "@nestjs/common";
import { AiLogsService } from "./ai-logs.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("ai-logs")
@UseGuards(JwtAuthGuard)
export class AiLogsController {
  constructor(private readonly aiLogsService: AiLogsService) {}

  @Get("summary")
  getSummary() {
    return this.aiLogsService.getSummary();
  }

  @Get("trend")
  getTrend() {
    return this.aiLogsService.getTrend();
  }

  @Get("recent")
  getRecentLogs() {
    return this.aiLogsService.getRecentLogs();
  }
}
