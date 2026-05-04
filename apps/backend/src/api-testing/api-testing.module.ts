import { Module } from "@nestjs/common";
import { ApiTestingController } from "./api-testing.controller";
import { CollectionsController } from "./collections.controller";
import { ExecutorService } from "./executor.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ApiTestingController, CollectionsController],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ApiTestingModule {}
