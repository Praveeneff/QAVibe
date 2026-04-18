import { Module } from "@nestjs/common";
import { TestCaseController } from "./test-case.controller";
import { TestCaseService } from "./test-case.service";
import { HistoryService } from "./history.service";
import { AuthModule } from "../auth/auth.module";
import { PermissionGuard } from "../common/guards/permission.guard";

@Module({
  imports: [AuthModule],
  controllers: [TestCaseController],
  providers: [TestCaseService, HistoryService, PermissionGuard],
  exports: [TestCaseService],
})
export class TestCaseModule {}
