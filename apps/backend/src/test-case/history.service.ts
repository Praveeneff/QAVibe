import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async saveSnapshot(
    testCaseId: string,
    testCase: object,
    changedBy: string | undefined,
    changeType: "manual" | "ai" | "restore",
  ) {
    // Get current max version for this testCase (default 0 if none yet)
    const agg = await this.prisma.testCaseHistory.aggregate({
      where: { testCaseId },
      _max: { version: true },
    });
    const nextVersion = (agg._max.version ?? 0) + 1;

    return this.prisma.testCaseHistory.create({
      data: {
        testCaseId,
        snapshot:   JSON.stringify(testCase),
        changedBy:  changedBy ?? null,
        changeType,
        version:    nextVersion,
      },
    });
  }

  async getHistory(testCaseId: string) {
    const rows = await this.prisma.testCaseHistory.findMany({
      where:   { testCaseId },
      orderBy: { version: "desc" },
    });

    return rows.map((row) => ({
      id:         row.id,
      version:    row.version,
      changedBy:  row.changedBy,
      changeType: row.changeType,
      changedAt:  row.changedAt,
      snapshot:   JSON.parse(row.snapshot) as object,
    }));
  }

  async restoreVersion(
    testCaseId: string,
    historyId:  string,
    restoredBy?: string,
  ) {
    const historyRow = await this.prisma.testCaseHistory.findUnique({
      where: { id: historyId },
    });

    if (!historyRow || historyRow.testCaseId !== testCaseId) {
      throw new NotFoundException(
        `History entry ${historyId} not found for test case ${testCaseId}`,
      );
    }

    const snap = JSON.parse(historyRow.snapshot) as Record<string, unknown>;

    // Update TestCase with every editable field from the snapshot
    const restored = await this.prisma.testCase.update({
      where: { id: testCaseId },
      data: {
        title:          (snap.title          as string)       ?? undefined,
        description:    (snap.description    as string | null) ?? null,
        steps:          (snap.steps          as string | null) ?? null,
        expectedResult: (snap.expectedResult as string | null) ?? null,
        category:       (snap.category       as string)       ?? undefined,
        executionType:  (snap.executionType  as string)       ?? undefined,
        priority:       (snap.priority       as string)       ?? undefined,
        severity:       (snap.severity       as string)       ?? undefined,
        status:         (snap.status         as string)       ?? undefined,
      },
    });

    // Save a snapshot of the restore action so it appears in history
    await this.saveSnapshot(testCaseId, restored, restoredBy, "restore");

    return restored;
  }
}
