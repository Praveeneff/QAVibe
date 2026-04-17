import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TestSuitesService {
  constructor(private readonly prisma: PrismaService) {}

  async createSuite(name: string, description?: string, parentId?: string, projectId?: string) {
    // Enforce max depth of 2 (3 levels: 0, 1, 2)
    let depth = 0;
    if (parentId) {
      const parent = await this.prisma.testSuite.findUnique({
        where: { id: parentId },
        select: { depth: true },
      });
      if (!parent) throw new NotFoundException(`Parent suite not found`);
      if (parent.depth >= 2) throw new BadRequestException(
        "Maximum nesting depth reached (Suite → Sub-suite → Group)"
      );
      depth = parent.depth + 1;
    }
    return this.prisma.testSuite.create({
      data: { name, description, parentId, depth, ...(projectId ? { projectId } : {}) },
    });
  }

  getAllSuites(projectId?: string) {
    return this.prisma.testSuite.findMany({
      where: { parentId: null, ...(projectId ? { projectId } : {}) }, // top-level only
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        depth: true,
        createdAt: true,
        _count: { select: { testCases: true } },
        children: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            depth: true,
            createdAt: true,
            _count: { select: { testCases: true } },
            children: {
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                description: true,
                depth: true,
                createdAt: true,
                _count: { select: { testCases: true } },
              },
            },
          },
        },
      },
    });
  }

  updateSuite(id: string, name?: string, description?: string) {
    return this.prisma.testSuite.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
    });
  }

  async deleteSuite(id: string) {
    await this.prisma.testCase.updateMany({
      where: { suiteId: id },
      data: { suiteId: null },
    });
    return this.prisma.testSuite.delete({ where: { id } });
  }

  assignCase(suiteId: string, testCaseId: string) {
    return this.prisma.testCase.update({
      where: { id: testCaseId },
      data: { suiteId },
    });
  }

  removeFromSuite(testCaseId: string) {
    return this.prisma.testCase.update({
      where: { id: testCaseId },
      data: { suiteId: null },
    });
  }
}
