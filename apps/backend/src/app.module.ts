import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envPath,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
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
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
