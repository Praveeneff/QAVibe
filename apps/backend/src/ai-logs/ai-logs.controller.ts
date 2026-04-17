import { Controller, Get, UseGuards, Request } from "@nestjs/common";
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

  @Get("my-logs")
  getMyLogs(@Request() req: any) {
    return this.aiLogsService.getMyLogs(req.user.id ?? req.user.sub);
  }
}
