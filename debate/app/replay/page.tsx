import Link from "next/link";

import { CASE_LIST } from "@/lib/cases";
import { listArchivedRuns } from "@/lib/run-archives";

export const dynamic = "force-dynamic";

export default async function ReplayLibraryPage() {
  const runs = await listArchivedRuns(24);

  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <p className="eyebrow">Replay Library</p>
        <h1>이전 실행 기록과 기본 케이스 리플레이</h1>
        <p>버튼으로 시작한 라이브 실행은 완료 시점에 저장되고, 여기서 다시 열어볼 수 있습니다.</p>
      </section>

      <section className="panel landing-notes case-library">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Saved Runs</p>
            <h2>Recent Live Executions</h2>
          </div>
          <Link href="/" className="nav-pill">
            Overview
          </Link>
        </div>

        {runs.length === 0 ? (
          <p className="settings-copy">아직 저장된 실행 기록이 없습니다. operator 화면에서 게임을 끝까지 실행해 보세요.</p>
        ) : (
          <div className="case-grid">
            {runs.map((run) => (
              <article key={run.runId} className="launch-card case-card">
                <span className="launch-kicker">Run Replay</span>
                <strong>{run.runId}</strong>
                <p>{run.publicSummary ?? "저장된 공개 요약이 없습니다."}</p>
                <div className="case-meta">
                  <span>{run.roundId}</span>
                  <strong>{run.selectedAction ?? "pending"}</strong>
                </div>
                <div className="case-meta">
                  <span>{run.completedAt}</span>
                  <strong>{run.eventCount} events</strong>
                </div>
                <div className="case-link-row">
                  <Link className="mini-pill active" href={`/replay/${run.runId}`}>
                    Open Replay
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel landing-notes case-library">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Static Cases</p>
            <h2>Canonical Replay Set</h2>
          </div>
        </div>
        <div className="case-grid">
          {CASE_LIST.map((entry) => (
            <article key={entry.roundId} className="launch-card case-card">
              <span className="launch-kicker">{entry.label}</span>
              <strong>{entry.title}</strong>
              <p>{entry.summary}</p>
              <div className="case-link-row">
                <Link className="mini-pill" href={`/replay/${entry.roundId}`}>
                  Open Case Replay
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
