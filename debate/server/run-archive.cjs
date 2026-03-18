const fs = require("node:fs/promises");
const path = require("node:path");

const RUN_ARCHIVE_DIR = process.env.RUN_ARCHIVE_DIR
  ? path.resolve(process.env.RUN_ARCHIVE_DIR)
  : path.join(process.cwd(), "artifacts", "runs");

function archivePath(runId) {
  return path.join(RUN_ARCHIVE_DIR, `${runId}.json`);
}

async function ensureArchiveDir() {
  await fs.mkdir(RUN_ARCHIVE_DIR, { recursive: true });
}

async function readArchivedRun(runId) {
  try {
    const raw = await fs.readFile(archivePath(runId), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function archiveRun(run) {
  await ensureArchiveDir();
  const previous = await readArchivedRun(run.runId);
  const next = {
    ...run,
    completedAt:
      typeof previous?.completedAt === "string" && previous.completedAt.length > 0
        ? previous.completedAt
        : run.completedAt
  };
  await fs.writeFile(archivePath(run.runId), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return archivePath(run.runId);
}

module.exports = {
  RUN_ARCHIVE_DIR,
  archiveRun
};
