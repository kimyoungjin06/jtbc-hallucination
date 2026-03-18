import { promises as fs } from "node:fs";
import path from "node:path";

import type { ArchivedRun, ArchivedRunSummary } from "@/lib/types";

const RUN_ARCHIVE_DIR = process.env.RUN_ARCHIVE_DIR
  ? path.resolve(process.env.RUN_ARCHIVE_DIR)
  : path.join(process.cwd(), "artifacts", "runs");

function isArchivedRun(value: unknown): value is ArchivedRun {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ArchivedRun).runId === "string" &&
    typeof (value as ArchivedRun).roundId === "string" &&
    Array.isArray((value as ArchivedRun).events)
  );
}

async function listArchiveFiles() {
  try {
    const entries = await fs.readdir(RUN_ARCHIVE_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(RUN_ARCHIVE_DIR, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readArchiveFile(filePath: string): Promise<ArchivedRun | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isArchivedRun(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function listArchivedRuns(limit = 12): Promise<ArchivedRunSummary[]> {
  const files = await listArchiveFiles();
  const runs = await Promise.all(files.map(readArchiveFile));

  return runs
    .filter((run): run is ArchivedRun => Boolean(run))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, Math.max(0, limit))
    .map((run) => ({
      runId: run.runId,
      roundId: run.roundId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      selectedAction: run.selectedAction,
      eventCount: run.eventCount,
      engine: run.engine,
      store: run.store,
      publicSummary: run.publicSummary
    }));
}

export async function getArchivedRun(runId: string): Promise<ArchivedRun | null> {
  if (!runId) {
    return null;
  }

  const filePath = path.join(RUN_ARCHIVE_DIR, `${runId}.json`);
  return readArchiveFile(filePath);
}
