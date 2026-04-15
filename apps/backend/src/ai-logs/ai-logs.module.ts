import { Module } from "@nestjs/common";
import { AiLogsController } from "./ai-logs.controller";
import { AiLogsService } from "./ai-logs.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AiLogsController],
  providers: [AiLogsService],
})
export class AiLogsModule {}
