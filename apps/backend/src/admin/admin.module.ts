import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";
import { RolesGuard } from "../auth/roles.guard";

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
})
export class AdminModule {}
