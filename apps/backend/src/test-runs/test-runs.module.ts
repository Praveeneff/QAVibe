import { Module } from "@nestjs/common";
import { TestRunsController } from "./test-runs.controller";
import { TestRunsService } from "./test-runs.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [TestRunsController],
  providers: [TestRunsService],
})
export class TestRunsModule {}
