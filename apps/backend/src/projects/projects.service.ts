import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_PERMISSIONS } from "../admin/permissions.seed";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List projects the caller belongs to (as owner or member) ─────────────
  async findAll(userId: string) {
    return this.prisma.project.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        owner:   { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: {
          select: { testCases: true, testSuites: true, testRuns: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── Get single project (caller must be member or owner) ───────────────────
  async findOne(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner:   { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: {
          select: { testCases: true, testSuites: true, testRuns: true },
        },
      },
    });
    if (!project) throw new NotFoundException("Project not found");
    this.assertMember(project, userId);
    return project;
  }

  // ── Create project; creator becomes OWNER member automatically ────────────
  async create(userId: string, name: string, description?: string) {
    const project = await this.prisma.project.create({
      data: {
        name,
        description: description ?? null,
        createdBy: userId,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
      include: {
        owner:   { select: { id: true, name: true, email: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    // Seed default permissions for this project
    await this.prisma.projectPermission.createMany({
      data: DEFAULT_PERMISSIONS.map((perm) => ({
        projectId: project.id,
        role: "tester",
        resource: perm.resource as any,
        action: perm.action as any,
        allowed: perm.allowed,
      })),
      skipDuplicates: true,
    });

    return project;
  }

  // ── Update name / description (owner only) ────────────────────────────────
  async update(
    id: string,
    userId: string,
    data: { name?: string; description?: string },
  ) {
    await this.assertOwner(id, userId);
    return this.prisma.project.update({ where: { id }, data });
  }

  // ── Delete project (owner only) ───────────────────────────────────────────
  async remove(id: string, userId: string) {
    await this.assertOwner(id, userId);
    return this.prisma.project.delete({ where: { id } });
  }

  // ── Add member ────────────────────────────────────────────────────────────
  async addMember(
    projectId: string,
    callerId: string,
    targetUserId: string,
    role: "OWNER" | "MEMBER" = "MEMBER",
  ) {
    await this.assertOwner(projectId, callerId);

    // Verify target user exists
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("User not found");

    // Upsert so duplicate calls are idempotent
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (existing) throw new ConflictException("User is already a member of this project");

    return this.prisma.projectMember.create({
      data: { projectId, userId: targetUserId, role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  // ── Remove member (owner only; cannot remove self if sole owner) ──────────
  async removeMember(projectId: string, callerId: string, targetUserId: string) {
    await this.assertOwner(projectId, callerId);

    if (callerId === targetUserId) {
      throw new ForbiddenException("Cannot remove yourself as owner. Transfer ownership first.");
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!membership) throw new NotFoundException("Member not found in project");

    return this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
  }

  // ── List members ──────────────────────────────────────────────────────────
  async listMembers(projectId: string, callerId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!project) throw new NotFoundException("Project not found");
    this.assertMember(project, callerId);
    return project.members;
  }

  // ── Permission queries ────────────────────────────────────────────────────

  async findMember(projectId: string, userId: string) {
    return this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  async getProjectPermissions(projectId: string, role: string) {
    return this.prisma.projectPermission.findMany({
      where: { projectId, role },
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });
  }

  // ── Private guards ────────────────────────────────────────────────────────

  private assertMember(
    project: { createdBy: string; members: { userId: string }[] },
    userId: string,
  ) {
    const isMember =
      project.createdBy === userId ||
      project.members.some((m) => m.userId === userId);
    if (!isMember) throw new ForbiddenException("Not a member of this project");
  }

  private async assertOwner(projectId: string, userId: string) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership || membership.role !== "OWNER") {
      throw new ForbiddenException("Only project owners can perform this action");
    }
  }
}
