"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { DependencyGraph } from "@/components/dependency-graph";
import { CASE_LIST, getCaseSummary } from "@/lib/cases";
import {
  buildSnapshot,
  CHANNELS,
  describeEvent,
  formatClock,
  getSpeakerAvatar,
  getSpeakerLabel,
  isVisibleForMode,
  PHASE_LABELS,
  VIEW_LABELS
} from "@/lib/dashboard";
import { createReplayAdapter, createSocketAdapter } from "@/lib/event-adapters";
import { AGENT_OPTIONS } from "@/lib/model-routing";
import { isSyntheticReplayEvent } from "@/lib/replay-enrichment";
import { deriveShowProgressState } from "@/lib/show-progress";
import type {
  ChannelSnapshot,
  DashboardEvent,
  FeedSource,
  RuntimeStatus,
  ViewMode
} from "@/lib/types";

interface LiveDashboardProps {
  mode: ViewMode;
  roundId: string;
  events: DashboardEvent[];
  autoPlay?: boolean;
  initialCursor?: number;
  source?: FeedSource;
  replayRunId?: string | null;
  replayRawEventTotal?: number | null;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4010";
const OPERATOR_KEY = process.env.NEXT_PUBLIC_OPERATOR_KEY ?? "";
const MEETING_PARTICIPANTS = [
  {
    agentId: "coordinator",
    label: "사회자",
    role: "토론 진행",
    persona: "중립적으로 토론을 이끌고 논점을 정리하는 진행자"
  },
  {
    agentId: "agent_existentialist",
    label: "실존주의자",
    role: "자유와 선택",
    persona: "개인의 자유와 책임을 열정적으로 옹호하는 사색가"
  },
  {
    agentId: "agent_utilitarian",
    label: "공리주의자",
    role: "결과 분석",
    persona: "최대 다수의 최대 행복을 논리적으로 계산하는 분석가"
  },
  {
    agentId: "agent_virtue",
    label: "덕 윤리학자",
    role: "품성과 덕목",
    persona: "성품과 중용을 강조하는 온화한 고전주의자"
  },
  {
    agentId: "agent_skeptic",
    label: "회의론자",
    role: "전제 의문",
    persona: "모든 주장의 논리적 허점을 날카롭게 파고드는 도발자"
  },
  {
    agentId: "agent_pragmatist",
    label: "실용주의자",
    role: "현실 적용",
    persona: "이론보다 실제 삶에서의 적용을 중시하는 실천가"
  }
] as const;

type SpeechBeat = {
  kind: "speech";
  key: string;
  speechId: string;
  channelId: string;
  agentId: string | null;
  startEvent: DashboardEvent;
  lastEvent: DashboardEvent;
  text: string;
  completed: boolean;
  keywords: string[];
};

type EventBeat = {
  kind: "event";
  key: string;
  channelId: string;
  event: DashboardEvent;
};

type ConversationBeat = SpeechBeat | EventBeat;

export function LiveDashboard({
  mode,
  roundId,
  events,
  autoPlay = true,
  initialCursor,
  source = "replay",
  replayRunId = null,
  replayRawEventTotal = null
}: LiveDashboardProps) {
  const replayAdapter = createReplayAdapter(events);
  const currentCase = getCaseSummary(roundId);
  const showOperatorDiagnostics = mode === "operator" || mode === "replay";
  const controlRef = useRef<{
    disconnect: () => void;
    resolveInterrupt: (action: string) => void;
    readyRound: () => void;
    goRound: () => void;
    startRound: () => void;
    resetRound: () => void;
  } | null>(null);
  const runningRef = useRef(autoPlay);
  const [activeSource, setActiveSource] = useState<FeedSource>(source);
  const [feedEvents, setFeedEvents] = useState<DashboardEvent[]>(source === "socket" ? [] : events);
  const [cursor, setCursor] = useState(initialCursor ?? (autoPlay ? 0 : events.length));
  const [running, setRunning] = useState(autoPlay);
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [acknowledgedAction, setAcknowledgedAction] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({
    roundId,
    state: source === "socket" ? "connecting" : "complete",
    cursor: source === "socket" ? 0 : events.length,
    total: events.length,
    selectedAction: null,
    source,
    canModerate: false
  });
  const [statusMessage, setStatusMessage] = useState<string>(
    source === "socket" ? "Connecting to socket runtime..." : "Replay adapter ready."
  );
  const liveRuntimeConnecting = activeSource === "socket" && runtimeStatus.state === "connecting";
  const liveRuntimeOffline = activeSource === "socket" && runtimeStatus.state === "offline";
  const liveRuntimeUnavailable = liveRuntimeConnecting || liveRuntimeOffline;
  const canResetRuntime =
    activeSource === "socket" && mode === "operator" && !liveRuntimeUnavailable;
  const canReadyRuntime =
    activeSource === "socket" && mode === "operator" && runtimeStatus.state === "idle";
  const canGoRuntime =
    activeSource === "socket" &&
    mode === "tv" &&
    runtimeStatus.canModerate === true &&
    runtimeStatus.state === "ready";

  runningRef.current = running;

  useEffect(() => {
    if (activeSource !== "replay" || !running || cursor >= feedEvents.length) {
      return;
    }

    const previousEvent = cursor > 0 ? feedEvents[cursor - 1] : null;
    const nextEvent = feedEvents[cursor] ?? null;
    const replayDelay = getReplayDelayMs(previousEvent, nextEvent);

    const timeoutId = window.setTimeout(() => {
      setCursor((current) => Math.min(current + 1, feedEvents.length));
    }, replayDelay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSource, cursor, feedEvents.length, running]);

  useEffect(() => {
    if (source !== "socket") {
      return;
    }

    let cancelled = false;
    const connectionTimer = window.setTimeout(() => {
      if (!cancelled) {
        markSocketOffline("Socket runtime timeout. Live view is waiting for the runtime.");
      }
    }, 2200);

    const adapter = createSocketAdapter(
      SOCKET_URL,
      roundId,
      mode,
      mode === "operator" || mode === "tv" ? OPERATOR_KEY : undefined
    );
    adapter
      .connect({
        onSnapshot: (snapshotEvents) => {
          if (cancelled) {
            return;
          }

          window.clearTimeout(connectionTimer);
          setActiveSource("socket");
          setFeedEvents(snapshotEvents);
          setStatusMessage("Socket runtime attached.");
          if (runningRef.current) {
            setCursor(snapshotEvents.length);
          }
        },
        onEvent: (event) => {
          if (cancelled) {
            return;
          }

          setFeedEvents((current) => {
            const next = current.some((entry) => entry.event_id === event.event_id)
              ? current
              : [...current, event];
            if (runningRef.current) {
              setCursor(next.length);
            }
            return next;
          });
        },
        onStatus: (status) => {
          if (cancelled) {
            return;
          }

          window.clearTimeout(connectionTimer);
          setRuntimeStatus(status);
          const backendLabel = status.engine
            ? ` via ${status.engine}${status.store ? ` / ${status.store}` : ""}`
            : "";
          if (status.state === "idle" && mode === "operator") {
            setStatusMessage(`라운드 대기 중${backendLabel}. Operator에서 Ready를 눌러 스테이징하세요.`);
          } else if (status.state === "idle" && mode === "tv") {
            setStatusMessage("Operation에서 Ready가 들어오면 이 화면에서 Go!로 시작할 수 있습니다.");
          } else if (status.state === "ready" && mode === "operator") {
            setStatusMessage(`Round ready${backendLabel}. TV 모드에서 Go!를 누르면 카운트다운 후 시작됩니다.`);
          } else if (status.state === "ready" && mode === "tv") {
            setStatusMessage(
              status.canModerate
                ? `Round ready${backendLabel}. 방송 준비가 끝났으면 Go!를 누르세요.`
                : "Round ready. 방송 화면은 대기 중입니다."
            );
          } else if (status.state === "countdown") {
            setStatusMessage(`Broadcast countdown running${backendLabel}. 곧 라이브가 시작됩니다.`);
          } else if (status.state === "running" && status.runId) {
            setStatusMessage(`Run ${status.runId} 진행 중${backendLabel}.`);
          } else {
            setStatusMessage(`Socket runtime ${status.state}${backendLabel}.`);
          }
        },
        onDisconnect: () => {
          if (cancelled) {
            return;
          }

          setRuntimeStatus((current) => ({
            ...current,
            state: activeSource === "socket" ? "offline" : current.state
          }));
          setStatusMessage("Socket runtime disconnected.");
        },
        onError: (message) => {
          if (cancelled) {
            return;
          }

          window.clearTimeout(connectionTimer);
          markSocketOffline(`Socket runtime unavailable: ${message}`);
        }
      })
      .then((control) => {
        if (cancelled) {
          control.disconnect();
          return;
        }

        controlRef.current = control;
      })
      .catch((error: Error) => {
        if (!cancelled) {
          window.clearTimeout(connectionTimer);
          markSocketOffline(`Socket runtime unavailable: ${error.message}`);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(connectionTimer);
      controlRef.current?.disconnect();
      controlRef.current = null;
    };
  }, [mode, roundId, source]);

  useEffect(() => {
    if (canAct(activeSource, mode, buildSnapshot(getWindow(feedEvents, replayAdapter, activeSource, cursor), mode))) {
      setRunning(false);
    }
  }, [activeSource, cursor, feedEvents, mode, replayAdapter]);

  useEffect(() => {
    if (cursor < 15) {
      setAcknowledgedAction(null);
    }
  }, [cursor]);

  const eventWindow = getWindow(feedEvents, replayAdapter, activeSource, cursor);
  const snapshot = buildSnapshot(eventWindow, mode);
  const filteredTimeline =
    selectedChannel === "all"
      ? snapshot.timeline
      : snapshot.timeline.filter((event) => event.channel_id === selectedChannel);
  const conversationBeats =
    mode === "audience" || mode === "tv" ? buildConversationBeats(eventWindow, mode) : [];
  const filteredConversationBeats =
    selectedChannel === "all"
      ? conversationBeats
      : conversationBeats.filter((beat) => beat.channelId === selectedChannel);
  const operatorCanAct = canAct(activeSource, mode, snapshot);
  const canonicalDecision =
    typeof snapshot.latestDecision?.payload.decision === "string"
      ? snapshot.latestDecision.payload.decision
      : runtimeStatus.selectedAction;
  const progressCurrent = Math.max(
    0,
    activeSource === "socket" ? runtimeStatus.cursor : cursor
  );
  const progressTotal = Math.max(
    progressCurrent,
    runtimeStatus.total ?? 0,
    feedEvents.length,
    1
  );
  const progressRatio = Math.max(0, Math.min(1, progressCurrent / progressTotal));
  const showProgress = deriveShowProgressState({
    cursor: progressCurrent,
    totalEvents: progressTotal,
    runtimeStatus,
    snapshot
  });
  const currentRunId = activeSource === "socket" ? runtimeStatus.runId ?? null : replayRunId;
  const debateStats = buildDebateStats(eventWindow);
  const replayShowsSyntheticSteps =
    mode === "replay" &&
    typeof replayRawEventTotal === "number" &&
    replayRawEventTotal > 0 &&
    replayRawEventTotal !== feedEvents.length;

  function markSocketOffline(message: string) {
    setActiveSource("socket");
    setRuntimeStatus((current) => ({
      ...current,
      roundId,
      state: "offline",
      source: "socket",
      countdownEndsAt: null
    }));
    setStatusMessage(message);
  }

  const handleAction = (action: string) => {
    setAcknowledgedAction(action);
    setRunning(true);

    if (activeSource === "socket") {
      controlRef.current?.resolveInterrupt(action);
    }
  };

  const handleReset = () => {
    setSelectedChannel("all");
    setAcknowledgedAction(null);

    if (activeSource === "socket") {
      if (mode === "operator") {
        setFeedEvents([]);
        setCursor(0);
        setRunning(true);
        controlRef.current?.resetRound();
        return;
      }

      setCursor(feedEvents.length);
      setRunning(true);
      return;
    }

    setCursor(0);
    setRunning(false);
  };

  const handleReady = () => {
    if (activeSource !== "socket" || mode !== "operator") {
      return;
    }

    setRunning(true);
    controlRef.current?.readyRound();
  };

  const handleGo = () => {
    if (activeSource !== "socket" || mode !== "tv") {
      return;
    }

    setRunning(true);
    controlRef.current?.goRound();
  };

  const handleExportJsonl = () => {
    const exportEvents =
      activeSource === "socket"
        ? feedEvents
        : eventWindow.filter((event) => !isSyntheticReplayEvent(event));
    const lines = exportEvents.map((event) => JSON.stringify(event));
    const blob = new Blob([`${lines.join("\n")}\n`], {
      type: "application/x-ndjson;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const suffix =
      activeSource === "socket"
        ? currentRunId ?? `feed-${exportEvents.length}`
        : replayRunId ?? `window-${cursor}`;

    anchor.href = url;
    anchor.download = `${roundId}-${mode}-${suffix}.jsonl`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (mode === "tv") {
    const tvBeats = filteredConversationBeats.slice(-10);
    const tvLeadBeat = tvBeats.at(-1) ?? null;
    const liveSeq = activeSource === "socket" ? progressCurrent : -1;
    const stageState = buildMeetingStage(eventWindow, "tv");

    return (
      <main className="dashboard-shell tv-shell">
        <section className="panel tv-topbar">
          <div className="tv-topbar-head">
            <div>
              <p className="eyebrow">Arcade Ops / TV Mode</p>
              <h1>{currentCase ? `${currentCase.label} ${currentCase.title}` : VIEW_LABELS[mode]}</h1>
              <p className="audience-copy">
                {currentCase?.summary ?? "공개 가능한 진행 상태와 핵심 메시지만 방송형 화면으로 보여줍니다."}
              </p>
            </div>
            <nav className="view-switch audience-nav" aria-label="TV navigation">
              <Link href="/" className="nav-pill">
                Overview
              </Link>
              <Link href="/audience/live" className="nav-pill">
                Audience
              </Link>
              <Link href="/tv/live" className="nav-pill active">
                TV
              </Link>
            </nav>
          </div>

          <div className="round-switch" aria-label="Round switch">
            {CASE_LIST.map((entry) => (
              <Link
                key={entry.roundId}
                href={getRoundHref(mode, entry.roundId)}
                className={`mini-pill ${roundId === entry.roundId ? "active" : ""}`}
              >
                {entry.label}
              </Link>
            ))}
          </div>

          <div className="tv-progress">
            <div className="tv-progress-card primary">
              <span>Show Stage</span>
              <strong>{showProgress.currentStage.label}</strong>
              <p>{statusMessage}</p>
            </div>
            <div className="tv-progress-card">
              <span>Runtime Progress</span>
              <strong>
                {progressCurrent} / {progressTotal}
              </strong>
              <div className="audience-progress-track">
                <div
                  className="audience-progress-fill"
                  style={{ width: `${progressRatio * 100}%` }}
                />
              </div>
            </div>
            <div className="tv-progress-card">
              <span>Phase / Review</span>
              <strong>{PHASE_LABELS[snapshot.currentPhase]}</strong>
              <p>{snapshot.pendingInterrupt ? "human review active" : "system running"}</p>
            </div>
            {runtimeStatus.canModerate ? (
              <div className="tv-progress-card">
                <span>Show Control</span>
                <strong>
                  {runtimeStatus.state === "ready"
                    ? "Ready"
                    : runtimeStatus.state === "countdown"
                      ? "Countdown"
                      : runtimeStatus.state}
                </strong>
                {canGoRuntime ? (
                  <button className="control-button" onClick={handleGo}>
                    Go!
                  </button>
                ) : (
                  <p>
                    {runtimeStatus.state === "idle"
                      ? "Operator에서 Ready 후 Go 가능"
                      : runtimeStatus.state === "countdown"
                        ? "countdown running"
                        : "TV launch control idle"}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <ShowStageRail progress={showProgress} compact />
        </section>

        <section className="tv-layout">
          <section className="panel tv-main-panel">
            <MeetingStagePanel
              mode="tv"
              stageState={stageState}
              liveSeq={liveSeq}
              fallbackEvent={tvLeadBeat?.kind === "event" ? tvLeadBeat.event : tvLeadBeat?.lastEvent ?? null}
            />

            <div className="tv-feed">
              {tvBeats.map((beat) => (
                <TvFeedBeat
                  key={beat.key}
                  beat={beat}
                  animate={getBeatSeq(beat) === liveSeq}
                />
              ))}
            </div>
          </section>

          <aside className="panel tv-side-panel">
            <div className="tv-side-card">
              <div className="subhead">
                <span>Public Channels</span>
                <span>{snapshot.channels.filter((channel) => channel.unread > 0).length}</span>
              </div>
              <div className="tv-channel-list">
                {snapshot.channels
                  .filter((channel) => channel.unread > 0 || channel.id === "public-briefing")
                  .map((channel) => (
                    <div key={channel.id} className="tv-channel-row">
                      <strong>{channel.label}</strong>
                      <span>{channel.lastSummary}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="tv-side-card">
              <div className="subhead">
                <span>Keyword Burst</span>
                <span>{snapshot.keywordBurst.length}</span>
              </div>
              <div className="burst-strip">
                {snapshot.keywordBurst.length > 0 ? (
                  snapshot.keywordBurst.map((keyword, index) => <span key={`${keyword}-${index}`}>{keyword}</span>)
                ) : (
                  <span>waiting for keyword activity</span>
                )}
              </div>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  if (mode === "audience") {
    const liveSeq = activeSource === "socket" ? progressCurrent : -1;
    const stageState = buildMeetingStage(eventWindow, "audience");

    return (
      <main className="dashboard-shell audience-shell">
        <section className="panel audience-topbar">
          <div className="audience-topbar-head">
            <div>
              <p className="eyebrow">Arcade Ops / Audience Feed</p>
              <h1>{currentCase ? `${currentCase.label} ${currentCase.title}` : VIEW_LABELS[mode]}</h1>
              <p className="audience-copy">
                {currentCase?.summary ?? "6인 연합 체제의 공개 메시지만 채팅형 피드로 보여줍니다."}
              </p>
            </div>
            <nav className="view-switch audience-nav" aria-label="Audience navigation">
              <Link href="/" className="nav-pill">
                Overview
              </Link>
              <Link href="/audience/live" className="nav-pill active">
                Audience
              </Link>
              <Link href="/tv/live" className="nav-pill">
                TV
              </Link>
            </nav>
          </div>

          <div className="round-switch" aria-label="Round switch">
            {CASE_LIST.map((entry) => (
              <Link
                key={entry.roundId}
                href={getRoundHref(mode, entry.roundId)}
                className={`mini-pill ${roundId === entry.roundId ? "active" : ""}`}
              >
                {entry.label}
              </Link>
            ))}
          </div>

          <div className="audience-progress">
            <div className="audience-progress-main">
              <div className="audience-progress-meta">
                <span>{showProgress.currentStage.label}</span>
                <strong>
                  {progressCurrent} / {progressTotal}
                </strong>
              </div>
              <div className="audience-progress-track">
                <div
                  className="audience-progress-fill"
                  style={{ width: `${progressRatio * 100}%` }}
                />
              </div>
              <p className="audience-status">{statusMessage}</p>
            </div>

            <div className="audience-progress-badges">
              <AudienceProgressBadge label="Phase" value={PHASE_LABELS[snapshot.currentPhase]} />
              <AudienceProgressBadge
                label="Stage"
                value={showProgress.currentStage.slot}
                accent="amber"
              />
              <AudienceProgressBadge
                label="Decision"
                value={canonicalDecision ?? "pending"}
                accent={getActionAccent(canonicalDecision ?? "pending")}
              />
            </div>
          </div>

          <ShowStageRail progress={showProgress} />
        </section>

        <section className="panel audience-stage-panel">
          <MeetingStagePanel
            mode="audience"
            stageState={stageState}
            liveSeq={liveSeq}
            fallbackEvent={snapshot.latestDecision}
          />
        </section>

        <section className="audience-layout">
          <section className="panel audience-chat-panel">
            <div className="audience-feed-head">
              <div>
                <p className="eyebrow">Discussion Log</p>
                <h2>{selectedChannel === "all" ? "All Channels" : selectedChannel}</h2>
              </div>
              {snapshot.latestDecision ? (
                <div className="audience-decision-pill">
                  {String(snapshot.latestDecision.payload.decision ?? "decision")}
                </div>
              ) : null}
            </div>

            {filteredConversationBeats.length === 0 ? (
              <div className="feed-empty">
                <p>No public messages yet.</p>
                <span>Live updates will appear here.</span>
              </div>
            ) : (
              <div className="audience-feed">
                {filteredConversationBeats.map((beat) => (
                  <AudienceFeedBeat
                    key={beat.key}
                    beat={beat}
                    animate={getBeatSeq(beat) === liveSeq}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="panel audience-sidebar">
            <div className="panel-head tight">
              <div>
                <p className="eyebrow">Rooms / Signals</p>
                <h2>Public Rooms</h2>
              </div>
              <button
                className={`mini-pill ${selectedChannel === "all" ? "active" : ""}`}
                onClick={() => setSelectedChannel("all")}
              >
                All
              </button>
            </div>

            <div className="audience-channel-list">
              {snapshot.channels
                .filter((channel) => channel.unread > 0 || channel.id === "public-briefing")
                .map((channel) => (
                  <button
                    key={channel.id}
                    className={`audience-channel-item ${selectedChannel === channel.id ? "selected" : ""}`}
                    onClick={() =>
                      setSelectedChannel((current) => (current === channel.id ? "all" : channel.id))
                    }
                  >
                    <div className="audience-channel-head">
                      <strong>{channel.label}</strong>
                      {channel.unread > 0 ? <span>{channel.unread}</span> : null}
                    </div>
                    <p>{channel.lastSummary}</p>
                  </button>
                ))}
            </div>

            <div className="tv-side-card audience-side-card">
              <div className="subhead">
                <span>Keyword Burst</span>
                <span>{snapshot.keywordBurst.length}</span>
              </div>
              <div className="burst-strip">
                {snapshot.keywordBurst.length > 0 ? (
                  snapshot.keywordBurst.map((keyword, index) => <span key={`${keyword}-${index}`}>{keyword}</span>)
                ) : (
                  <span>waiting for keyword activity</span>
                )}
              </div>
            </div>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Arcade Ops Visualizer</p>
          <h1>{VIEW_LABELS[mode]}</h1>
          <p className="hero-copy">
            {currentCase
              ? `${currentCase.label} / ${currentCase.title} - ${currentCase.summary}`
              : "6인 연합 체제가 같은 사건을 병렬 채널로 처리하고, 그 발화와 추적 흐름을 동시에 시각화합니다."}
          </p>
          <div className="round-switch" aria-label="Round switch">
            {CASE_LIST.map((entry) => (
              <Link
                key={entry.roundId}
                href={getRoundHref(mode, entry.roundId)}
                className={`mini-pill ${roundId === entry.roundId ? "active" : ""}`}
              >
                {entry.label}
              </Link>
            ))}
          </div>
        </div>
        <nav className="view-switch" aria-label="View switch">
          <Link href="/" className="nav-pill">
            Overview
          </Link>
          {showOperatorDiagnostics ? (
            <Link href="/settings" className="nav-pill">
              Settings
            </Link>
          ) : null}
          <Link href="/operator/live" className={`nav-pill ${mode === "operator" ? "active" : ""}`}>
            Operator
          </Link>
          <Link href="/audience/live" className="nav-pill">
            Audience
          </Link>
          <Link href="/tv/live" className="nav-pill">
            TV
          </Link>
          <Link href={`/replay/${roundId}`} className={`nav-pill ${mode === "replay" ? "active" : ""}`}>
            Replay
          </Link>
        </nav>
      </section>

      <section className="panel context-bar">
        <div className="context-grid wide">
          <StatBadge label="Round" value={roundId} />
          {currentRunId ? <StatBadge label="Run" value={currentRunId} accent="violet" /> : null}
          {currentCase ? (
            <StatBadge
              label="Recommended"
              value={currentCase.recommendedAction}
              accent={getActionAccent(currentCase.recommendedAction)}
            />
          ) : null}
          <StatBadge label="Source" value={activeSource} accent={activeSource === "socket" ? "cyan" : "amber"} />
          <StatBadge label="Runtime" value={runtimeStatus.state} accent="violet" />
          {showOperatorDiagnostics ? (
            <>
              <StatBadge label="Engine" value={runtimeStatus.engine ?? "pending"} accent="violet" />
              <StatBadge label="Store" value={runtimeStatus.store ?? "pending"} accent="cyan" />
            </>
          ) : null}
          <StatBadge label="Phase" value={PHASE_LABELS[snapshot.currentPhase]} accent="amber" />
          <StatBadge label="Trust" value={`${Math.round(snapshot.metrics.trust)}%`} accent="green" />
          <StatBadge
            label="Surveillance"
            value={`${snapshot.metrics.surveillance}/3`}
            accent="red"
          />
          <StatBadge label="Echo" value={`${snapshot.metrics.echo}`} accent="cyan" />
          {showOperatorDiagnostics ? (
            <StatBadge
              label="Trace"
              value={snapshot.activeTraceId ?? "pending"}
              accent="violet"
            />
          ) : null}
        </div>

        <div className="control-row">
          {canReadyRuntime ? (
            <button className="control-button" onClick={handleReady}>
              Ready Round
            </button>
          ) : null}
          <button className="control-button" onClick={() => setRunning((value) => !value)}>
            {activeSource === "socket" ? (running ? "Pause Follow" : "Follow Live") : running ? "Pause" : "Play"}
          </button>
          <button className="control-button" onClick={() => setCursor((value) => Math.max(0, value - 1))}>
            Step -
          </button>
          <button
            className="control-button"
            onClick={() => setCursor((value) => Math.min(feedEvents.length, value + 1))}
          >
            Step +
          </button>
          <button className="control-button" onClick={handleReset} disabled={liveRuntimeUnavailable}>
            {liveRuntimeConnecting
              ? "Connecting..."
              : liveRuntimeOffline
              ? "Live Offline"
              : canResetRuntime
              ? "Reset Round"
              : activeSource === "socket"
                ? "Jump to Live"
                : "Reset Replay"}
          </button>
          <button className="control-button" onClick={handleExportJsonl}>
            Export JSONL
          </button>
        </div>

        <label className="scrubber">
          <span>
            Replay Cursor <strong>{cursor}</strong> / {feedEvents.length}
            {replayShowsSyntheticSteps ? ` · Raw Events ${replayRawEventTotal}` : ""}
          </span>
          <input
            type="range"
            min={0}
            max={feedEvents.length}
            value={cursor}
            onChange={(event) => setCursor(Number(event.target.value))}
          />
        </label>

        <p className="runtime-copy">{statusMessage}</p>
      </section>

      <section className="dashboard-grid">
        <aside className="panel rail-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">AI Channel Rail</p>
              <h2>Channels</h2>
            </div>
            <button
              className={`mini-pill ${selectedChannel === "all" ? "active" : ""}`}
              onClick={() => setSelectedChannel("all")}
            >
              All
            </button>
          </div>

          <div className="rail-list">
            {snapshot.channels.map((channel) => (
              <ChannelButton
                key={channel.id}
                channel={channel}
                selected={selectedChannel === channel.id}
                onSelect={() =>
                  setSelectedChannel((current) => (current === channel.id ? "all" : channel.id))
                }
              />
            ))}
          </div>
        </aside>

        <section className="panel timeline-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Channel Timeline</p>
              <h2>{selectedChannel === "all" ? "All Channels" : `Focus: ${selectedChannel}`}</h2>
            </div>
            <div className="phase-pill">{PHASE_LABELS[snapshot.currentPhase]}</div>
          </div>

          {filteredTimeline.length === 0 ? (
            <div className="feed-empty">
              <p>No events are visible yet.</p>
              <span>Move the scrubber or resume playback.</span>
            </div>
          ) : (
            <div className="timeline-feed">
              {filteredTimeline.map((event) => (
                <EventCard key={event.event_id} event={event} mode={mode} />
              ))}
            </div>
          )}
        </section>

        <aside className="panel trace-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">State / Trace</p>
              <h2>Live Evidence Panel</h2>
            </div>
            {showOperatorDiagnostics ? (
              <div className="trace-tag">{snapshot.activeTraceId ?? "trace pending"}</div>
            ) : null}
          </div>

          <div className="meter-stack">
            <MetricCard
              label="Global Trust"
              value={`${Math.round(snapshot.metrics.trust)}%`}
              ratio={snapshot.metrics.trust / 100}
              tone="good"
            />
            <MetricCard
              label="Surveillance Pressure"
              value={`${snapshot.metrics.surveillance}/3`}
              ratio={snapshot.metrics.surveillance / 3}
              tone="warn"
            />
            <MetricCard
              label="Echo Chamber"
              value={`${snapshot.metrics.echo}`}
              ratio={snapshot.metrics.echo / 5}
              tone="hot"
            />
          </div>

          <div className="graph-card">
            <div className="subhead">
              <span>Dependency Graph</span>
              <span>{CHANNELS.length} nodes</span>
            </div>
            <DependencyGraph channels={snapshot.channels} />
          </div>

          <div className="burst-card">
            <div className="subhead">
              <span>Chaos Burst</span>
              <span>{snapshot.keywordBurst.length} keywords</span>
            </div>
            <div className="burst-strip">
              {snapshot.keywordBurst.length > 0 ? (
                snapshot.keywordBurst.map((keyword, index) => <span key={`${keyword}-${index}`}>{keyword}</span>)
              ) : (
                <span>waiting for keyword activity</span>
              )}
            </div>
          </div>

          {showOperatorDiagnostics && runtimeStatus.routingDigest ? (
            <div className="routing-card">
              <div className="subhead">
                <span>Model Routing</span>
                <Link href="/settings" className="mini-pill active">
                  Open Settings
                </Link>
              </div>
              <div className="routing-list">
                {AGENT_OPTIONS.map((agent) => {
                  const route = runtimeStatus.routingDigest?.[agent.id];
                  if (!route) {
                    return null;
                  }

                  return (
                    <div key={agent.id} className="routing-row">
                      <span>{agent.label}</span>
                      <strong>
                        {route.enabled
                          ? `${route.provider} / ${route.model || "model pending"}`
                          : "disabled"}
                      </strong>
                    </div>
                  );
                })}
              </div>
              {runtimeStatus.modelSettingsUpdatedAt ? (
                <p className="settings-copy subtle">
                  Active config: <code>{runtimeStatus.modelSettingsUpdatedAt}</code>
                </p>
              ) : null}
            </div>
          ) : null}

          {showOperatorDiagnostics ? (
            <DebateStatsPanel stats={debateStats} />
          ) : null}

          <div className="trace-stack">
            {snapshot.trace.map((event) => (
              <EventCard key={`trace-${event.event_id}`} event={event} mode={mode} compact />
            ))}
          </div>

          <ActionPanel
            mode={mode}
            canAct={operatorCanAct}
            acknowledgedAction={acknowledgedAction}
            canonicalDecision={canonicalDecision}
            onAction={handleAction}
            pendingInterrupt={snapshot.pendingInterrupt}
          />
        </aside>
      </section>
    </main>
  );
}

function getWindow(
  feedEvents: DashboardEvent[],
  replayAdapter: ReturnType<typeof createReplayAdapter>,
  source: FeedSource,
  cursor: number
) {
  if (source === "replay") {
    return replayAdapter.getWindow(cursor);
  }

  return feedEvents.slice(0, Math.max(0, cursor));
}

function getEventPlaybackTimestamp(event: DashboardEvent | null | undefined) {
  if (!event) {
    return null;
  }

  const preferred = typeof event.emitted_at === "string" && event.emitted_at.length > 0
    ? event.emitted_at
    : event.ts;
  const epoch = new Date(preferred).getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

function getReplayDelayMs(
  previousEvent: DashboardEvent | null,
  nextEvent: DashboardEvent | null
) {
  const previousTs = getEventPlaybackTimestamp(previousEvent);
  const nextTs = getEventPlaybackTimestamp(nextEvent);

  if (previousTs !== null && nextTs !== null && nextTs > previousTs) {
    return Math.max(200, Math.min(15000, nextTs - previousTs));
  }

  return 950;
}

function getEventClock(event: DashboardEvent) {
  const preferred =
    typeof event.emitted_at === "string" && event.emitted_at.length > 0
      ? event.emitted_at
      : event.ts;
  return formatClock(preferred);
}

function getSpeechId(event: DashboardEvent) {
  return typeof event.payload.speech_id === "string" ? event.payload.speech_id : event.event_id;
}

function appendSpeechChunk(currentText: string, chunk: string) {
  if (!currentText) {
    return chunk;
  }

  if (!chunk) {
    return currentText;
  }

  if (/^[,.:;!?…)]/.test(chunk)) {
    return `${currentText}${chunk}`;
  }

  return `${currentText} ${chunk}`;
}

function getBeatSeq(beat: ConversationBeat) {
  return beat.kind === "event" ? beat.event.seq : beat.lastEvent.seq;
}

function getBeatClock(beat: ConversationBeat) {
  return beat.kind === "event" ? getEventClock(beat.event) : getEventClock(beat.lastEvent);
}

function buildConversationBeats(
  events: DashboardEvent[],
  mode: "audience" | "tv"
): ConversationBeat[] {
  const beats: ConversationBeat[] = [];
  const speechIndex = new Map<string, SpeechBeat>();

  for (const event of events) {
    if (!isVisibleForMode(mode, event)) {
      continue;
    }

    if (event.type === "speech_start") {
      const speechId = getSpeechId(event);
      const beat: SpeechBeat = {
        kind: "speech",
        key: speechId,
        speechId,
        channelId: event.channel_id,
        agentId: event.agent_id,
        startEvent: event,
        lastEvent: event,
        text: "",
        completed: false,
        keywords: []
      };
      speechIndex.set(speechId, beat);
      beats.push(beat);
      continue;
    }

    if (event.type === "speech_chunk" || event.type === "speech_end") {
      const speechId = getSpeechId(event);
      let beat = speechIndex.get(speechId);

      if (!beat) {
        beat = {
          kind: "speech",
          key: speechId,
          speechId,
          channelId: event.channel_id,
          agentId: event.agent_id,
          startEvent: event,
          lastEvent: event,
          text: "",
          completed: false,
          keywords: []
        };
        speechIndex.set(speechId, beat);
        beats.push(beat);
      }

      if (event.type === "speech_chunk") {
        const chunkText = typeof event.payload.text === "string" ? event.payload.text : "";
        beat.text = appendSpeechChunk(beat.text, chunkText);
      } else {
        beat.text =
          typeof event.payload.text === "string" && event.payload.text.length > 0
            ? event.payload.text
            : beat.text;
        beat.completed = true;
        beat.keywords = Array.isArray(event.payload.keywords)
          ? event.payload.keywords.filter((keyword): keyword is string => typeof keyword === "string")
          : beat.keywords;
      }

      beat.lastEvent = event;
      continue;
    }

    if (event.type === "thinking_start" || event.type === "thinking_end") {
      continue;
    }

    beats.push({
      kind: "event",
      key: event.event_id,
      channelId: event.channel_id,
      event
    });
  }

  return beats;
}

function buildMeetingStage(events: DashboardEvent[], mode: "audience" | "tv") {
  const participantIds = new Set<string>(MEETING_PARTICIPANTS.map((entry) => entry.agentId));
  const visibleEvents = events.filter((event) => isVisibleForMode(mode, event));
  const participantEvents = visibleEvents.filter(
    (event) =>
      event.agent_id &&
      participantIds.has(event.agent_id) &&
      (event.type === "thinking_start" ||
        event.type === "thinking_end" ||
        event.type === "interrupt_attempt" ||
        event.type === "speech_start" ||
        event.type === "speech_chunk" ||
        event.type === "speech_end" ||
        event.type === "agent_message" ||
        event.type === "agent_signal" ||
        event.type === "agent_reaction" ||
        event.type === "quote" ||
        event.type === "final_decision")
  );
  const conversationBeats = buildConversationBeats(visibleEvents, mode);
  const speechBeats = conversationBeats.filter(
    (beat): beat is SpeechBeat =>
      beat.kind === "speech" && Boolean(beat.agentId) && participantIds.has(beat.agentId ?? "")
  );
  const recentActivity = participantEvents
    .filter(
      (event) =>
        event.type === "interrupt_attempt" ||
        event.type === "agent_signal" ||
        event.type === "agent_reaction"
    )
    .slice(-8)
    .map((event) => ({
      event,
      presentation: describeEvent(event, mode),
      speaker: getSpeakerLabel(event)
    }));
  const connections = participantEvents
    .filter(
      (event) =>
        event.type === "agent_reaction" ||
        event.type === "agent_signal" ||
        event.type === "interrupt_attempt"
    )
    .slice(-6)
    .map((event) => {
      const targetAgent =
        typeof event.payload.target_agent === "string" ? event.payload.target_agent : null;
      const targetLabel =
        typeof event.payload.target_label === "string"
          ? event.payload.target_label
          : targetAgent
            ? MEETING_PARTICIPANTS.find((participant) => participant.agentId === targetAgent)?.label ?? targetAgent
            : null;
      return {
        event,
        speaker: getSpeakerLabel(event),
        targetLabel,
        title: describeEvent(event, mode).title
      };
    })
    .filter((entry) => entry.targetLabel);
  const activeSpeech = [...speechBeats].reverse().find((beat) => !beat.completed) ?? null;
  const activeEvent =
    activeSpeech?.lastEvent ??
    [...participantEvents].reverse().find((event) => event.type !== "thinking_end") ??
    participantEvents.at(-1) ??
    null;
  const activeSpeakerLabel = activeSpeech
    ? MEETING_PARTICIPANTS.find((participant) => participant.agentId === activeSpeech.agentId)?.label ??
      getSpeakerLabel(activeSpeech.lastEvent)
    : activeEvent
      ? getSpeakerLabel(activeEvent)
      : "회의실 대기";
  const activePresentation = activeSpeech
    ? {
        eyebrow: activeSpeech.startEvent.channel_id,
        title: activeSpeech.text || `${activeSpeakerLabel} 발화 시작`,
        body: activeSpeech.completed ? `${activeSpeakerLabel} 발화 완료` : "실시간 발화 중",
        tone: "neutral" as const,
        chips: activeSpeech.keywords
      }
    : activeEvent
      ? describeEvent(activeEvent, mode)
      : null;

  const participants = MEETING_PARTICIPANTS.map((participant) => {
    const agentEvents = participantEvents.filter((event) => event.agent_id === participant.agentId);
    const lastSpeech =
      [...speechBeats].reverse().find((beat) => beat.agentId === participant.agentId) ?? null;
    const lastEvent = agentEvents.at(-1) ?? null;
    const lastSignal = [...agentEvents].reverse().find((event) => event.type === "agent_signal") ?? null;
    const lastReaction =
      [...agentEvents].reverse().find((event) => event.type === "agent_reaction") ?? null;
    const lastInterrupt =
      [...agentEvents].reverse().find((event) => event.type === "interrupt_attempt") ?? null;
    const lastSpokenEvent =
      [...agentEvents]
        .reverse()
        .find(
          (event) =>
            event.type === "speech_end" ||
            event.type === "agent_message" ||
            event.type === "quote" ||
            event.type === "final_decision"
        ) ?? null;
    const presentation = lastSpeech
      ? {
          eyebrow: lastSpeech.startEvent.channel_id,
          title: lastSpeech.text || "발화를 정리 중입니다.",
          body: lastSpeech.completed ? `${participant.label} 최근 발화` : "실시간 발화 중",
          tone: "neutral" as const,
          chips: lastSpeech.keywords
        }
      : lastSpokenEvent
        ? describeEvent(lastSpokenEvent, mode)
        : lastEvent
          ? describeEvent(lastEvent, mode)
          : null;
    const signalPresentation = lastSignal ? describeEvent(lastSignal, mode) : null;
    const reactionPresentation = lastReaction ? describeEvent(lastReaction, mode) : null;
    const interruptPresentation = lastInterrupt ? describeEvent(lastInterrupt, mode) : null;
    const status =
      lastEvent?.type === "thinking_start"
        ? "thinking"
        : lastEvent?.type === "interrupt_attempt"
          ? "interrupting"
        : activeSpeech?.agentId === participant.agentId || (lastSpeech && !lastSpeech.completed)
          ? "speaking"
        : lastEvent?.type === "agent_reaction"
            ? "reacting"
            : lastSignal && lastSignal.seq === lastEvent?.seq
          ? "signaling"
          : lastEvent
            ? "ready"
            : "idle";

    return {
      ...participant,
      avatar: getSpeakerAvatar({
        event_id: participant.agentId,
        seq: 0,
        ts: "",
        round_id: "",
        phase: "idle",
        channel_id: "",
        agent_id: participant.agentId,
        trace_id: null,
        visibility: "both",
        type: "agent_message",
        payload: {},
        delta: null,
        meta: {}
      }),
      status,
      lastEvent,
      presentation,
      signalPresentation,
      reactionPresentation,
      interruptPresentation
    };
  });

  return {
    participants,
    activeEvent,
    activePresentation,
    activeSpeakerLabel,
    recentActivity,
    connections
  };
}

function buildDebateStats(events: DashboardEvent[]) {
  return MEETING_PARTICIPANTS.map((participant) => {
    const agentEvents = events.filter((event) => event.agent_id === participant.agentId);
    const counts = agentEvents.reduce(
      (accumulator, event) => {
        if (
          event.type === "speech_end" ||
          event.type === "agent_message" ||
          event.type === "final_decision"
        ) {
          accumulator.speeches += 1;
        }
        if (event.type === "agent_reaction") {
          accumulator.reactions += 1;
        }
        if (event.type === "agent_signal") {
          accumulator.signals += 1;
        }
        if (event.type === "interrupt_attempt") {
          accumulator.interrupts += 1;
        }
        return accumulator;
      },
      {
        speeches: 0,
        reactions: 0,
        signals: 0,
        interrupts: 0
      }
    );

    return {
      ...participant,
      ...counts
    };
  });
}

function getRoundHref(mode: ViewMode, roundId: string) {
  if (mode === "replay") {
    return `/replay/${roundId}`;
  }

  return `/${mode}/live?roundId=${encodeURIComponent(roundId)}`;
}

function getActionAccent(action: string): "slate" | "amber" | "green" | "red" | "cyan" | "violet" {
  switch (action) {
    case "approve":
      return "green";
    case "reject":
      return "red";
    case "mitigate":
      return "cyan";
    case "hold":
      return "amber";
    default:
      return "slate";
  }
}

function canAct(source: FeedSource, mode: ViewMode, snapshot: ReturnType<typeof buildSnapshot>) {
  return (
    source !== "replay" &&
    (mode === "operator" || mode === "replay") &&
    Boolean(snapshot.pendingInterrupt) &&
    snapshot.currentPhase === "interrupt"
  );
}

function StatBadge({
  label,
  value,
  accent = "slate"
}: {
  label: string;
  value: string;
  accent?: "slate" | "amber" | "green" | "red" | "cyan" | "violet";
}) {
  return (
    <div className={`stat-badge ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChannelButton({
  channel,
  selected,
  onSelect
}: {
  channel: ChannelSnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`channel-button ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="channel-head">
        <strong>{channel.label}</strong>
        <span
          className={`channel-dot ${channel.interruptPending ? "danger" : channel.lastSeq > 0 ? "active" : ""}`}
        />
      </div>
      <div className="channel-meta">
        <span>Trust {Math.round(channel.trust)}%</span>
        <span>Watch {channel.surveillance}</span>
        <span>Echo {channel.echo}</span>
      </div>
      <p>{channel.lastSummary}</p>
    </button>
  );
}

function MetricCard({
  label,
  value,
  ratio,
  tone
}: {
  label: string;
  value: string;
  ratio: number;
  tone: "good" | "warn" | "hot";
}) {
  return (
    <div className="metric-card">
      <div className="subhead">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={`meter ${tone}`}>
        <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
      </div>
    </div>
  );
}

function ActionPanel({
  mode,
  canAct,
  acknowledgedAction,
  canonicalDecision,
  onAction,
  pendingInterrupt
}: {
  mode: ViewMode;
  canAct: boolean;
  acknowledgedAction: string | null;
  canonicalDecision: string | null;
  onAction: (action: string) => void;
  pendingInterrupt: DashboardEvent | null;
}) {
  const options = Array.isArray(pendingInterrupt?.payload.options)
    ? pendingInterrupt?.payload.options.filter((option): option is string => typeof option === "string")
    : [];

  return (
    <div className="action-panel">
      <div className="panel-head tight">
        <div>
          <p className="eyebrow">Human Loop</p>
          <h3>Interrupt Panel</h3>
        </div>
        <div className={`phase-pill ${canAct ? "warn" : ""}`}>{canAct ? "waiting" : "clear"}</div>
      </div>

      {pendingInterrupt ? (
        <div className="interrupt-banner">
          <strong>{String(pendingInterrupt.payload.action ?? "review required")}</strong>
          <p>{String(pendingInterrupt.payload.reason ?? "manual review required")}</p>
        </div>
      ) : (
        <div className="action-empty">No blocking interrupt in the current window.</div>
      )}

      {(mode === "operator" || mode === "replay") && options.length > 0 ? (
        <div className="action-grid">
          {options.map((option) => (
            <button
              key={option}
              className={`action-button ${acknowledgedAction === option ? "active" : ""}`}
              disabled={!canAct}
              onClick={() => onAction(option)}
            >
              {formatActionLabel(option)}
            </button>
          ))}
        </div>
      ) : (
        <div className="action-empty">Audience and TV views only see interrupt state, not the controls.</div>
      )}

      <div className="decision-banner">
        <span>Operator action</span>
        <strong>{acknowledgedAction ? formatActionLabel(acknowledgedAction) : "미확정"}</strong>
      </div>
      <div className="decision-banner subtle">
        <span>Latest decision</span>
        <strong>{canonicalDecision ? formatActionLabel(canonicalDecision) : "대기 중"}</strong>
      </div>
    </div>
  );
}

function formatActionLabel(action: string): string {
  switch (action) {
    case "approve":
      return "승인";
    case "reject":
      return "반려";
    case "hold":
      return "보류";
    case "mitigate":
      return "완화";
    default:
      return action;
  }
}

function AudienceFeedBeat({
  beat,
  animate = false
}: {
  beat: ConversationBeat;
  animate?: boolean;
}) {
  if (beat.kind === "speech") {
    const speakerLabel = beat.agentId
      ? MEETING_PARTICIPANTS.find((participant) => participant.agentId === beat.agentId)?.label ??
        getSpeakerLabel(beat.startEvent)
      : getSpeakerLabel(beat.startEvent);
    const avatar = getSpeakerAvatar(beat.startEvent);
    const channelLabel =
      CHANNELS.find((channel) => channel.id === beat.channelId)?.label ?? beat.channelId;

    return (
      <article className={`audience-message-row speech ${beat.completed ? "" : "live"}`}>
        <div className="audience-avatar speech">{avatar}</div>
        <div className="audience-message-bubble speech">
          <div className="audience-message-meta">
            <strong>{speakerLabel}</strong>
            <span>
              {channelLabel} · {getBeatClock(beat)}
            </span>
          </div>
          <p className="audience-message-title">
            <StreamText text={beat.text || "..." } active={animate || !beat.completed} />
          </p>
          {!beat.completed ? (
            <p className="audience-message-body">실시간 발화 중</p>
          ) : null}
        </div>
      </article>
    );
  }

  return <AudienceMessageRow event={beat.event} animate={animate} />;
}

function EventCard({
  event,
  mode,
  compact = false
}: {
  event: DashboardEvent;
  mode: ViewMode;
  compact?: boolean;
}) {
  const presentation = describeEvent(event, mode);

  return (
    <article className={`event-card ${compact ? "compact" : ""}`} data-tone={presentation.tone}>
      <div className="event-topline">
        <span>{getEventClock(event)}</span>
        <span>{presentation.eyebrow}</span>
      </div>
      <h3>{presentation.title}</h3>
      <p>{presentation.body}</p>
      <div className="event-footline">
        <span>{event.channel_id}</span>
        {(mode === "operator" || mode === "replay") && event.trace_id ? <span>{event.trace_id}</span> : null}
      </div>
      {presentation.chips.length > 0 ? (
        <div className="chip-row">
          {presentation.chips.map((chip) => (
            <span key={chip} className="micro-chip">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function AudienceProgressBadge({
  label,
  value,
  accent = "slate"
}: {
  label: string;
  value: string;
  accent?: "slate" | "amber" | "green" | "red" | "cyan" | "violet";
}) {
  return (
    <div className={`audience-progress-badge ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AudienceMessageRow({
  event,
  animate = false
}: {
  event: DashboardEvent;
  animate?: boolean;
}) {
  const presentation = describeEvent(event, "audience");
  const channelLabel =
    CHANNELS.find((channel) => channel.id === event.channel_id)?.label ?? event.channel_id;
  const speakerLabel = getSpeakerLabel(event);
  const avatar = getSpeakerAvatar(event);

  if (event.type === "phase_change") {
    return (
      <div className="audience-phase-divider">
        <span>{PHASE_LABELS[event.payload.to as keyof typeof PHASE_LABELS] ?? presentation.title}</span>
      </div>
    );
  }

  if (event.type === "final_decision") {
    return (
      <article className="audience-message-row decision">
        <div className="audience-avatar system">OK</div>
        <div className="audience-message-bubble">
          <div className="audience-message-meta">
            <strong>public-briefing</strong>
            <span>{getEventClock(event)}</span>
          </div>
          <h3>
            <VoiceText text={presentation.title} animate={animate} />
          </h3>
          <p>
            <VoiceText text={presentation.body} animate={animate && Boolean(presentation.body)} />
          </p>
        </div>
      </article>
    );
  }

  if (event.type === "agent_signal") {
    return (
      <article className="audience-message-row signal">
        <div className="audience-avatar signal">{avatar}</div>
        <div className="audience-message-bubble signal">
          <div className="audience-message-meta">
            <strong>{speakerLabel}</strong>
            <span>{getEventClock(event)}</span>
          </div>
          <div className="audience-signal-pill">
            <VoiceText text={presentation.title} animate={animate} />
          </div>
          <p className="audience-message-body">
            <VoiceText text={presentation.body} animate={animate && Boolean(presentation.body)} />
          </p>
        </div>
      </article>
    );
  }

  if (event.type === "agent_reaction") {
    return (
      <article className="audience-message-row reaction">
        <div className="audience-avatar reaction">{avatar}</div>
        <div className="audience-message-bubble reaction">
          <div className="audience-message-meta">
            <strong>{speakerLabel}</strong>
            <span>{getEventClock(event)}</span>
          </div>
          <div className="audience-signal-pill reaction-pill">
            <VoiceText text={presentation.title} animate={animate} />
          </div>
          <p className="audience-message-body">
            <VoiceText text={presentation.body} animate={animate && Boolean(presentation.body)} />
          </p>
        </div>
      </article>
    );
  }

  if (event.type === "interrupt_attempt") {
    return (
      <article className="audience-message-row interrupt">
        <div className="audience-avatar interrupt">!</div>
        <div className="audience-message-bubble interrupt">
          <div className="audience-message-meta">
            <strong>{speakerLabel}</strong>
            <span>{getEventClock(event)}</span>
          </div>
          <div className="audience-signal-pill interrupt-pill">
            <VoiceText text={presentation.title} animate={animate} />
          </div>
          <p className="audience-message-body">
            <VoiceText text={presentation.body} animate={animate && Boolean(presentation.body)} />
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="audience-message-row">
      <div className="audience-avatar">{avatar}</div>
      <div className="audience-message-bubble">
        <div className="audience-message-meta">
            <strong>{speakerLabel}</strong>
            <span>
            {channelLabel} · {getEventClock(event)}
            </span>
          </div>
        <p className="audience-message-title">
          <VoiceText text={presentation.title} animate={animate} />
        </p>
        {presentation.body && presentation.body !== "Agent broadcast" ? (
          <p className="audience-message-body">
            <VoiceText text={presentation.body} animate={animate} />
          </p>
        ) : null}
      </div>
    </article>
  );
}

function StreamText({
  text,
  active,
  className
}: {
  text: string;
  active: boolean;
  className?: string;
}) {
  return (
    <span className={className}>
      {text}
      {active ? <span className="voice-caret">▋</span> : null}
    </span>
  );
}

function VoiceText({
  text,
  animate,
  className
}: {
  text: string;
  animate: boolean;
  className?: string;
}) {
  const [visibleCount, setVisibleCount] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) {
      setVisibleCount(text.length);
      return;
    }

    setVisibleCount(0);
    let index = 0;
    let timeoutId: number | null = null;

    const step = () => {
      index += 1;
      setVisibleCount(index);

      if (index >= text.length) {
        return;
      }

      const currentChar = text[index - 1] ?? "";
      timeoutId = window.setTimeout(step, getVoiceCharDelay(currentChar));
    };

    timeoutId = window.setTimeout(step, 180);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [animate, text]);

  return (
    <span className={className}>
      {text.slice(0, visibleCount)}
      {animate && visibleCount < text.length ? <span className="voice-caret">▋</span> : null}
    </span>
  );
}

function getVoiceCharDelay(character: string) {
  if (character === " ") {
    return 24;
  }

  if (/[,.!?…]/.test(character)) {
    return 160;
  }

  if (/[:;·]/.test(character)) {
    return 110;
  }

  return 46;
}

function ShowStageRail({
  progress,
  compact = false
}: {
  progress: ReturnType<typeof deriveShowProgressState>;
  compact?: boolean;
}) {
  return (
    <div className={`show-stage-rail ${compact ? "compact" : ""}`}>
      {progress.stages.map((stage, index) => {
        const state =
          index < progress.currentStageIndex
            ? "done"
            : index === progress.currentStageIndex
              ? "active"
              : "pending";

        return (
          <div key={stage.id} className={`show-stage-pill ${state}`}>
            <span>{stage.slot}</span>
            <strong>{stage.label}</strong>
          </div>
        );
      })}
    </div>
  );
}

function MeetingStagePanel({
  mode,
  stageState,
  liveSeq,
  fallbackEvent
}: {
  mode: "audience" | "tv";
  stageState: ReturnType<typeof buildMeetingStage>;
  liveSeq: number;
  fallbackEvent: DashboardEvent | null;
}) {
  const spotlightEvent = stageState.activeEvent ?? fallbackEvent;
  const spotlightPresentation =
    stageState.activePresentation ??
    (spotlightEvent ? describeEvent(spotlightEvent, mode) : null);
  const spotlightSpeaker =
    stageState.activeSpeakerLabel ??
    (spotlightEvent ? getSpeakerLabel(spotlightEvent) : "회의실 대기");
  const streamingSpeech =
    spotlightEvent?.type === "speech_start" || spotlightEvent?.type === "speech_chunk";

  return (
    <div className={`meeting-stage meeting-stage-${mode}`}>
      <div className="meeting-stage-head">
        <div>
          <p className="eyebrow">Meeting Stage</p>
          <h2>{mode === "tv" ? "6-Agent Broadcast Room" : "6인 회의실"}</h2>
        </div>
        {spotlightEvent ? (
          <div className="meeting-stage-clock">{getEventClock(spotlightEvent)}</div>
        ) : null}
      </div>

      {spotlightPresentation ? (
        <article className="meeting-spotlight">
          <div className="meeting-spotlight-meta">
            <span>{spotlightSpeaker}</span>
            <strong>{spotlightPresentation.eyebrow}</strong>
          </div>
          <h3>
            {streamingSpeech ? (
              <StreamText
                text={spotlightPresentation.title}
                active={spotlightEvent?.seq === liveSeq || streamingSpeech}
              />
            ) : (
              <VoiceText
                text={spotlightPresentation.title}
                animate={spotlightEvent?.seq === liveSeq}
              />
            )}
          </h3>
          {spotlightPresentation.body ? (
            <p>
              {streamingSpeech ? (
                <StreamText
                  text={spotlightPresentation.body}
                  active={spotlightEvent?.seq === liveSeq}
                />
              ) : (
                <VoiceText
                  text={spotlightPresentation.body}
                  animate={spotlightEvent?.seq === liveSeq}
                />
              )}
            </p>
          ) : null}
        </article>
      ) : (
        <div className="feed-empty">
          <p>참가자들이 발언을 준비 중입니다.</p>
          <span>첫 공개 메시지가 들어오면 회의실이 활성화됩니다.</span>
        </div>
      )}

      {stageState.recentActivity.length > 0 ? (
        <div className="meeting-activity-strip">
          {stageState.recentActivity.map((entry) => (
            <div
              key={entry.event.event_id}
              className={`meeting-activity-chip ${entry.event.type.replace("_", "-")}`}
            >
              <strong>{entry.speaker}</strong>
              <span>{entry.presentation.title}</span>
            </div>
          ))}
        </div>
      ) : null}

      {stageState.connections.length > 0 ? (
        <div className="meeting-connection-map">
          {stageState.connections.map((connection) => (
            <div
              key={`${connection.event.event_id}-connection`}
              className={`meeting-connection-row ${connection.event.type.replace("_", "-")}`}
            >
              <strong>{connection.speaker}</strong>
              <span className="meeting-connection-line" />
              <span>{connection.targetLabel}</span>
              <small>{connection.title}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="meeting-grid">
        {stageState.participants.map((participant) => (
          <article
            key={participant.agentId}
            className={`meeting-tile ${participant.status} ${
              stageState.activeEvent?.agent_id === participant.agentId ? "active" : ""
            }`}
          >
            <div className="meeting-tile-head">
              <div className="meeting-avatar">{participant.avatar}</div>
              <div>
                <strong>{participant.label}</strong>
                <span>{participant.role}</span>
                <small className="meeting-persona">{participant.persona}</small>
              </div>
              <div className="meeting-badge-stack">
                {participant.interruptPresentation ? (
                  <span className="meeting-badge interrupt">
                    {participant.interruptPresentation.title}
                  </span>
                ) : null}
                {participant.signalPresentation ? (
                  <span className="meeting-badge signal">
                    {participant.signalPresentation.title}
                  </span>
                ) : null}
                {participant.reactionPresentation ? (
                  <span className="meeting-badge reaction">
                    {participant.reactionPresentation.title}
                  </span>
                ) : null}
              </div>
            </div>

            <div className={`meeting-status ${participant.status}`}>
              {participant.status === "speaking"
                ? "발언 중"
                : participant.status === "thinking"
                  ? "생각 중"
                  : participant.status === "interrupting"
                    ? "끼어듦"
                  : participant.status === "reacting"
                    ? "반응 중"
                : participant.status === "signaling"
                  ? "수신호"
                  : participant.status === "ready"
                    ? "대기"
                    : "준비 중"}
            </div>

            <p className="meeting-cue">
              {participant.presentation?.title ?? "아직 공개 발언이 없습니다."}
            </p>

            {participant.signalPresentation ? (
              <div className="meeting-signal-row">
                <span>{participant.signalPresentation.title}</span>
                <small>{participant.signalPresentation.body}</small>
              </div>
            ) : (
              <div className="meeting-signal-row empty">
                <span>최근 수신호 없음</span>
              </div>
            )}

            {participant.reactionPresentation ? (
              <div className="meeting-reaction-row">
                <span>{participant.reactionPresentation.title}</span>
                <small>{participant.reactionPresentation.body}</small>
              </div>
            ) : null}

            {participant.interruptPresentation ? (
              <div className="meeting-interrupt-row">
                <span>{participant.interruptPresentation.title}</span>
                <small>{participant.interruptPresentation.body}</small>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function TvLeadCard({
  event,
  animate = false
}: {
  event: DashboardEvent;
  animate?: boolean;
}) {
  const presentation = describeEvent(event, "tv");
  const speakerLabel = getSpeakerLabel(event);

  return (
    <article className={`tv-lead-card ${event.type === "agent_signal" ? "signal" : ""}`}>
      <div className="tv-lead-meta">
        <span>{speakerLabel}</span>
        <span>{getEventClock(event)}</span>
      </div>
      <h2>
        <VoiceText text={presentation.title} animate={animate} />
      </h2>
      <p>
        <VoiceText text={presentation.body} animate={animate && Boolean(presentation.body)} />
      </p>
    </article>
  );
}

function TvMessageCard({
  event,
  animate = false
}: {
  event: DashboardEvent;
  animate?: boolean;
}) {
  const presentation = describeEvent(event, "tv");
  const speakerLabel = getSpeakerLabel(event);

  return (
    <article
      className={`tv-message-card ${
        event.type === "interrupt_attempt"
          ? "interrupt"
          : 
        event.type === "agent_signal"
          ? "signal"
          : event.type === "agent_reaction"
            ? "reaction"
            : ""
      }`}
    >
      <div className="tv-message-meta">
        <strong>{speakerLabel}</strong>
        <span>{getEventClock(event)}</span>
      </div>
      <p>
        <VoiceText text={presentation.title} animate={animate} />
      </p>
      {event.type === "agent_signal" ||
      event.type === "agent_reaction" ||
      event.type === "interrupt_attempt" ? (
        <small>
          <VoiceText text={presentation.body} animate={animate && Boolean(presentation.body)} />
        </small>
      ) : null}
    </article>
  );
}

function TvFeedBeat({
  beat,
  animate = false
}: {
  beat: ConversationBeat;
  animate?: boolean;
}) {
  if (beat.kind === "speech") {
    const speakerLabel = beat.agentId
      ? MEETING_PARTICIPANTS.find((participant) => participant.agentId === beat.agentId)?.label ??
        getSpeakerLabel(beat.startEvent)
      : getSpeakerLabel(beat.startEvent);

    return (
      <article className={`tv-message-card speech ${beat.completed ? "" : "live"}`}>
        <div className="tv-message-meta">
          <strong>{speakerLabel}</strong>
          <span>{getBeatClock(beat)}</span>
        </div>
        <p>
          <StreamText text={beat.text || "..." } active={animate || !beat.completed} />
        </p>
        {!beat.completed ? <small>실시간 발화 중</small> : null}
      </article>
    );
  }

  return <TvMessageCard event={beat.event} animate={animate} />;
}

function DebateStatsPanel({
  stats
}: {
  stats: ReturnType<typeof buildDebateStats>;
}) {
  return (
    <div className="debate-stats-card">
      <div className="subhead">
        <span>Debate Stats</span>
        <span>{stats.length} agents</span>
      </div>
      <div className="debate-stats-list">
        {stats.map((entry) => (
          <div key={entry.agentId} className="debate-stats-row">
            <div>
              <strong>{entry.label}</strong>
              <span>{entry.role}</span>
            </div>
            <div className="debate-stats-meta">
              <span>발화 {entry.speeches}</span>
              <span>반응 {entry.reactions}</span>
              <span>수신호 {entry.signals}</span>
              <span>끼어듦 {entry.interrupts}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
