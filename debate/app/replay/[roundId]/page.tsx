import Link from "next/link";

import { LiveDashboard } from "@/components/live-dashboard";
import { getCaseEvents } from "@/lib/cases";
import { enrichReplayEvents } from "@/lib/replay-enrichment";
import { getArchivedRun } from "@/lib/run-archives";

export const dynamic = "force-dynamic";

export default async function ReplayPage({
  params
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  const archivedRun = await getArchivedRun(roundId);
  const rawEvents = archivedRun?.events ?? getCaseEvents(roundId);
  const events = enrichReplayEvents(rawEvents);
  const replayRoundId = archivedRun?.roundId ?? roundId;

  if (events.length === 0) {
    return (
      <main className="landing-shell">
        <section className="panel landing-notes">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Replay Missing</p>
              <h1>{roundId}</h1>
            </div>
          </div>
          <p>현재 등록된 replay가 없습니다.</p>
          <Link href="/" className="nav-pill active">
            Back to overview
          </Link>
        </section>
      </main>
    );
  }

  return (
    <LiveDashboard
      mode="replay"
      roundId={replayRoundId}
      events={events}
      autoPlay
      initialCursor={0}
      replayRunId={archivedRun?.runId ?? null}
      replayRawEventTotal={rawEvents.length}
    />
  );
}
