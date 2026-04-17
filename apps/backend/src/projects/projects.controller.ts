import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ProjectsService } from "./projects.service";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // GET /projects
  @Get()
  findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user.id);
  }

  // GET /projects/:id
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req: any) {
    return this.projectsService.findOne(id, req.user.id);
  }

  // POST /projects
  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body("name") name: string,
    @Body("description") description: string | undefined,
    @Request() req: any,
  ) {
    if (!name?.trim()) throw new BadRequestException("name is required");
    return this.projectsService.create(req.user.id, name.trim(), description);
  }

  // PATCH /projects/:id
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: { name?: string; description?: string },
    @Request() req: any,
  ) {
    return this.projectsService.update(id, req.user.id, body);
  }

  // DELETE /projects/:id
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @Request() req: any) {
    return this.projectsService.remove(id, req.user.id);
  }

  // ── Members ───────────────────────────────────────────────────────────────

  // GET /projects/:id/members
  @Get(":id/members")
  listMembers(@Param("id") id: string, @Request() req: any) {
    return this.projectsService.listMembers(id, req.user.id);
  }

  // POST /projects/:id/members
  @Post(":id/members")
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @Param("id") projectId: string,
    @Body("userId") userId: string,
    @Body("role") role: "OWNER" | "MEMBER" | undefined,
    @Request() req: any,
  ) {
    if (!userId?.trim()) throw new BadRequestException("userId is required");
    return this.projectsService.addMember(projectId, req.user.id, userId.trim(), role);
  }

  // DELETE /projects/:id/members/:userId
  @Delete(":id/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param("id") projectId: string,
    @Param("userId") targetUserId: string,
    @Request() req: any,
  ) {
    return this.projectsService.removeMember(projectId, req.user.id, targetUserId);
  }
}
