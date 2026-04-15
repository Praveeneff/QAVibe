import { Module } from "@nestjs/common";
import { TestSuitesController } from "./test-suites.controller";
import { TestSuitesService } from "./test-suites.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [TestSuitesController],
  providers: [TestSuitesService],
})
export class TestSuitesModule {}
