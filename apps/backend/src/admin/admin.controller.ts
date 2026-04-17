import {
  Controller, Get, Post, Body,
  Param, UseGuards,
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get("projects/:projectId/members-full")
  getUsersWithProjectAccess(
    @Param("projectId") projectId: string,
  ) {
    return this.adminService.getUsersWithProjectAccess(projectId);
  }

  @Post("token-limits")
  setTokenLimit(
    @Body("userId") userId: string,
    @Body("limitTokens") limitTokens: number,
    @Body("projectId") projectId?: string,
  ) {
    return this.adminService.setTokenLimit(userId, limitTokens, projectId);
  }

  @Get("token-limits")
  getTokenLimits() {
    return this.adminService.getTokenLimits();
  }

  @Get("token-usage")
  getTokenUsage() {
    return this.adminService.getTokenUsage();
  }

  @Post("token-usage/:userId/reset")
  resetTokenUsage(@Param("userId") userId: string) {
    return this.adminService.resetTokenUsage(userId);
  }
}
