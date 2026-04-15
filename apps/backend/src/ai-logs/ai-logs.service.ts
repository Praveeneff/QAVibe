import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AiLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [total, agg, fallbackCount, byProvider, allFallbacks] =
      await Promise.all([
        this.prisma.aiGenerationLog.count(),
        this.prisma.aiGenerationLog.aggregate({
          _sum: { caseCount: true },
          _avg: { latencyMs: true },
        }),
        this.prisma.aiGenerationLog.count({
          where: { fallbackFrom: { not: null } },
        }),
        this.prisma.aiGenerationLog.groupBy({
          by: ["provider"],
          _count: { id: true },
          _avg: { latencyMs: true, caseCount: true },
        }),
        this.prisma.aiGenerationLog.findMany({
          where: { fallbackFrom: { not: null } },
          select: { fallbackFrom: true },
        }),
      ]);

    // Count how many times each provider name appears in fallbackFrom
    // (i.e. how many times that provider caused a fallback to the next)
    const failureCounts = new Map<string, number>();
    for (const row of allFallbacks) {
      if (row.fallbackFrom) {
        failureCounts.set(
          row.fallbackFrom,
          (failureCounts.get(row.fallbackFrom) ?? 0) + 1,
        );
      }
    }

    const providerBreakdown = byProvider.map((p) => ({
      provider: p.provider,
      count: p._count.id,
      avgLatencyMs: Math.round(p._avg.latencyMs ?? 0),
      avgCaseCount: Math.round((p._avg.caseCount ?? 0) * 10) / 10,
      failureCount: failureCounts.get(p.provider) ?? 0,
    }));

    return {
      totalGenerations: total,
      totalCasesGenerated: agg._sum.caseCount ?? 0,
      avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
      fallbackRate:
        total > 0
          ? Math.round((fallbackCount / total) * 1000) / 10
          : 0,
      providerBreakdown,
    };
  }

  async getTrend() {
    // Fetch the 30 most recent rows, then reverse to ascending for charting
    const rows = await this.prisma.aiGenerationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        provider: true,
        latencyMs: true,
        caseCount: true,
        createdAt: true,
      },
    });
    return rows.reverse();
  }

  getRecentLogs() {
    return this.prisma.aiGenerationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        promptTokens: true,
        latencyMs: true,
        caseCount: true,
        fallbackFrom: true,
        createdAt: true,
      },
    });
  }
}
