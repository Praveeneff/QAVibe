import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import * as path from "path";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { TestCaseModule } from "./test-case/test-case.module";
import { TestRunsModule } from "./test-runs/test-runs.module";
import { AiModule } from "./ai/ai.module";
import { TestSuitesModule } from "./test-suites/test-suites.module";
import { AiLogsModule } from "./ai-logs/ai-logs.module";
import { AuthModule } from "./auth/auth.module";
import { ProjectsModule } from "./projects/projects.module";
import { AdminModule } from "./admin/admin.module";

const envPath = path.resolve(process.cwd(), ".env");
console.log("Loading .env from:", envPath);
console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET" : "MISSING");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envPath,
    }),
    PrismaModule,
    TestCaseModule,
    TestRunsModule,
    AiModule,
    TestSuitesModule,
    AiLogsModule,
    AuthModule,
    ProjectsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
