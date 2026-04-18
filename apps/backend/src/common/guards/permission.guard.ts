import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service";

export const PERMISSION_KEY = "permission";

export interface PermissionRequirement {
  resource: string;
  action: string;
}

// Decorator to mark endpoints with required permission
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action });

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.get<PermissionRequirement>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    if (!requirement) {
      return true; // No permission required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    // Admin always has permission
    if (user.role === "admin") {
      return true;
    }

    // Get projectId from request (params, query, or body)
    const projectId =
      request.params?.projectId ||
      request.query?.projectId ||
      request.body?.projectId;

    if (!projectId) {
      throw new ForbiddenException("Project ID required for permission check");
    }

    // Check permission in database
    const permission = await this.prisma.projectPermission.findFirst({
      where: {
        projectId,
        role: user.role,
        resource: requirement.resource,
        action: requirement.action,
      },
    });

    if (!permission || !permission.allowed) {
      throw new ForbiddenException(
        `You don't have permission to ${requirement.action} ${requirement.resource}`,
      );
    }

    return true;
  }
}
