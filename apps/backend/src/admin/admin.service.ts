import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // GET all registered users with tokenUsed and role
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tokenUsed: true,
        tokenResetAt: true,
        createdAt: true,
        tokenLimits: {
          select: {
            id: true,
            projectId: true,
            limitTokens: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // GET all users with project access status for a project
  async getUsersWithProjectAccess(projectId: string) {
    const [allUsers, members] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.projectMember.findMany({
        where: { projectId },
        select: { userId: true, role: true },
      }),
    ]);

    const memberMap = new Map(members.map((m) => [m.userId, m.role]));

    return allUsers.map((user) => ({
      ...user,
      projectRole: memberMap.get(user.id) ?? null,
      isMember: memberMap.has(user.id),
    }));
  }

  // SET token limit for a user (global or per-project)
  async setTokenLimit(
    userId: string,
    limitTokens: number,
    projectId?: string,
  ) {
    return this.prisma.userTokenLimit.upsert({
      where: {
        userId_projectId: {
          userId,
          projectId: projectId ?? null,
        },
      },
      update: { limitTokens },
      create: {
        userId,
        projectId: projectId ?? null,
        limitTokens,
      },
    });
  }

  // GET all token limits
  async getTokenLimits() {
    return this.prisma.userTokenLimit.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  // GET token usage for all users
  async getTokenUsage() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        tokenUsed: true,
        tokenResetAt: true,
        tokenLimits: {
          where: { projectId: null },
          select: { limitTokens: true },
        },
      },
      orderBy: { tokenUsed: "desc" },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      tokenUsed: u.tokenUsed,
      tokenResetAt: u.tokenResetAt,
      globalLimit: u.tokenLimits[0]?.limitTokens ?? 50000,
      percentUsed: Math.round(
        (u.tokenUsed / (u.tokenLimits[0]?.limitTokens ?? 50000)) * 100,
      ),
    }));
  }

  // RESET token usage for a user
  async resetTokenUsage(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { tokenUsed: 0, tokenResetAt: new Date() },
    });
  }

  // GET permissions for a project (or global if projectId null)
  async getPermissions(projectId?: string) {
    return this.prisma.projectPermission.findMany({
      where: { projectId: projectId ?? null },
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });
  }

  // UPDATE a single permission
  async updatePermission(
    projectId: string | null,
    role: string,
    resource: string,
    action: string,
    allowed: boolean,
  ) {
    return this.prisma.projectPermission.upsert({
      where: {
        projectId_role_resource_action: {
          projectId: projectId ?? null,
          role,
          resource: resource as any,
          action: action as any,
        },
      },
      update: { allowed },
      create: {
        projectId: projectId ?? null,
        role,
        resource: resource as any,
        action: action as any,
        allowed,
      },
    });
  }
}
