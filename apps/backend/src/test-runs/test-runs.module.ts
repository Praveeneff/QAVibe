import { Module } from "@nestjs/common";
import { TestRunsController } from "./test-runs.controller";
import { TestRunsService } from "./test-runs.service";
import { AuthModule } from "../auth/auth.module";
import { PermissionGuard } from "../common/guards/permission.guard";

@Module({
  imports: [AuthModule],
  controllers: [TestRunsController],
  providers: [TestRunsService, PermissionGuard],
})
export class TestRunsModule {}
