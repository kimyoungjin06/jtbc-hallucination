"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  DEBATE_TOPICS,
  AI_AGENT_PERSONAS,
  MODEL_OPTIONS,
  DEFAULT_PARTICIPANTS,
  EVAL_DIMENSIONS,
  ROUND_LABELS,
  ALL_GRADES,
  GRADE_ORDER,
  GRADE_COLORS,
  GRADE_LABELS,
  computeRoundGrade,
  computeOverallGrade,
  getGradeStatus,
  formatGrade,
  gradeToPercent,
  generateAnnouncement,
  createInitialDebateStates,
  type Grade,
  type Participant,
  type ParticipantEvaluation,
  type RoundScore,
  type EvalDimension,
} from "@/lib/executor-types";

import { computeDimensionGrades, type ParticipantObservations } from "@/lib/google-sheet";

/* ══════════════════════════════════════
   Hooks
   ══════════════════════════════════════ */

/* ── TTS ── */

interface TTSVoice { id: string; label: string; gender: string; type: string; }

type VoiceFilter = "none" | "broadcast" | "courtroom" | "doom" | "executor";
const FILTER_LABELS: Record<VoiceFilter, string> = {
  none: "필터 없음",
  broadcast: "방송 아나운서",
  courtroom: "법정 선고",
  executor: "집행관 (엄중)",
  doom: "최후통첩",
};

type TTSProvider = "google" | "openai";
const PROVIDER_LABELS: Record<TTSProvider, string> = {
  google: "Google TTS",
  openai: "OpenAI (엄중한 톤)",
};

type ProductionStyle = "none" | "sting" | "courtdrama" | "doomsday";
const PRODUCTION_LABELS: Record<ProductionStyle, string> = {
  none: "효과음 없음",
  sting: "드라마틱 스팅",
  courtdrama: "법정 드라마",
  doomsday: "최후심판",
};

const DEFAULT_TTS = {
  provider: "openai" as TTSProvider,
  voiceId: "onyx",
  speakingRate: 1.0,
  pitch: -4.0,
  pitchShift: -6,
  flattenIntonation: true,
  pauseBetween: 2500,
  filter: "executor" as VoiceFilter,
  production: "doomsday" as ProductionStyle,
  reverbMix: 0.25,
};

function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [settings, setSettings] = useState(DEFAULT_TTS);
  const settingsRef = useRef(settings);
  settingsRef.current = settings; // always latest
  const cancelledRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/executor/tts").then(r => r.json()).then(d => { if (d.voices?.google) setVoices(d.voices.google); else if (d.voices) setVoices(d.voices); }).catch(() => {});
  }, []);

  const speakText = useCallback(async (text: string): Promise<void> => {
    const s = settingsRef.current; // always read latest settings via ref
    const res = await fetch("/api/executor/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider: s.provider, voiceId: s.voiceId, speakingRate: s.speakingRate, pitch: s.pitch, pitchShift: s.pitchShift, flattenIntonation: s.flattenIntonation, filter: s.filter, production: s.production })
    });
    if (!res.ok) {
      return new Promise(resolve => {
        if (typeof window === "undefined" || !window.speechSynthesis) { resolve(); return; }
        const u = new SpeechSynthesisUtterance(text); u.lang = "ko-KR"; u.rate = 0.9;
        u.onend = () => resolve(); u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return new Promise(resolve => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => resolve());
    });
  }, []); // settingsRef로 항상 최신 설정 읽으므로 의존성 불필요

  const speak = useCallback(async (text: string) => {
    cancelledRef.current = false; setIsSpeaking(true);
    await speakText(text); setIsSpeaking(false);
  }, [speakText]);

  const announce = useCallback(async (queue: { text: string; participantId: string }[]) => {
    cancelledRef.current = false; setIsSpeaking(true);
    await speakText("지금부터 최종 인사 발령을 발표합니다.");
    await new Promise(r => setTimeout(r, 1500));
    for (let i = 0; i < queue.length; i++) {
      if (cancelledRef.current) break;
      setCurrentIndex(i);
      await new Promise(r => setTimeout(r, 800));
      await speakText(queue[i].text);
      await new Promise(r => setTimeout(r, settings.pauseBetween));
    }
    if (!cancelledRef.current) {
      await new Promise(r => setTimeout(r, 1000));
      await speakText("이상으로 최종 인사 발령을 마칩니다.");
    }
    setIsSpeaking(false); setCurrentIndex(-1);
  }, [speakText, settings.pauseBetween]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false); setCurrentIndex(-1);
  }, []);

  return { isSpeaking, currentIndex, voices, settings, setSettings, speak, announce, cancel };
}

/* ── Live Debate (SSE streaming) ── */

interface AgentInternalState { id: string; urgency: number; thought: string; emotion: string; reaction_emoji: string; position?: string; }
interface ReactionEvent { agentId: string; emoji: string; targetId: string; }
interface InterruptEvent { by: string; target: string; cutAt: number; }
interface ProgressEvent { turn: number; maxTurns: number; spoken: number; }
interface RecordedEvent { type: string; data: unknown; delayMs: number; }

/* (typing is handled directly inside AgentPanel) */

function useDebateLive() {
  const [agentStates, setAgentStates] = useState<Record<string, AgentInternalState>>({});
  const [speakingAgent, setSpeakingAgent] = useState<string | null>(null);
  const [sentences, setSentences] = useState<Record<string, string[]>>({});
  const [interruptInfo, setInterruptInfo] = useState<InterruptEvent | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [finalResult, setFinalResult] = useState<{ content: string; chars: number } | null>(null);
  const [stats, setStats] = useState<{ totalTokens: number; estimatedCost: number; model?: string; turns?: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [consensus, setConsensus] = useState<{ direction: string; strength: number; agree_count: number; disagree_count: number } | null>(null);
  const [debatePhase, setDebatePhase] = useState<{ phase: string; intensity: number }>({ phase: "opening", intensity: 1 });
  const [keyMoment, setKeyMoment] = useState<{ type: string; description: string } | null>(null);
  const [concession, setConcession] = useState<{ from: string; to: string; point: string } | null>(null);

  const recordRef = useRef<RecordedEvent[]>([]);
  const startTimeRef = useRef(0);
  const teamRef = useRef<"A" | "B">("A");
  const setTeam = useCallback((t: "A" | "B") => { teamRef.current = t; }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatchEvent = useCallback((ev: string, d: any) => {
    if (ev === "states") {
      const map: Record<string, AgentInternalState> = {};
      for (const s of d.states) map[s.id] = s;
      setAgentStates(map);
    } else if (ev === "speaking") {
      setSpeakingAgent(d.agentId);
      // 재발언 시 문단 구분자 삽입
      setSentences(prev => {
        const existing = prev[d.agentId];
        if (existing && existing.length > 0) {
          return { ...prev, [d.agentId]: [...existing, "__BREAK__"] };
        }
        return prev;
      });
      setInterruptInfo(null);
    } else if (ev === "sentence") {
      setSentences(p => ({ ...p, [d.agentId]: [...(p[d.agentId] || []), d.text] }));
    } else if (ev === "interrupt") {
      setInterruptInfo(d);
      setSpeakingAgent(d.by);
    } else if (ev === "reaction") {
      setReactions(p => [...p, d]);
    } else if (ev === "final") {
      setSpeakingAgent(null);
      setFinalResult(d);
    } else if (ev === "consensus") {
      setConsensus(d);
    } else if (ev === "phase") {
      setDebatePhase(d);
    } else if (ev === "key_moment") {
      setKeyMoment(d);
      if (mountedRef.current) setTimeout(() => { if (mountedRef.current) setKeyMoment(null); }, 5000);
    } else if (ev === "concession") {
      setConcession(d);
      if (mountedRef.current) setTimeout(() => { if (mountedRef.current) setConcession(null); }, 5000);
    } else if (ev === "status") {
      setStatusMessage(d.message || "");
    } else if (ev === "progress") {
      setProgress(d);
    } else if (ev === "heartbeat") {
      // keep-alive, no action needed
    } else if (ev === "done") {
      setStatusMessage(""); setStats(d); setStatus("done");
    } else if (ev === "error") {
      setError(d.error); setStatus("error");
    }
  }, []);

  // Buffer for decoupling server speed from client display
  const bufferRef = useRef<{type: string; data: unknown}[]>([]);
  const playHeadRef = useRef(0);
  const playingRef = useRef(false);
  const mountedRef = useRef(true);
  const streamEndedRef = useRef(false);

  // Playback engine: reads from buffer, dispatches with timing
  const startPlayback = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;

    async function loop() {
      let idleCount = 0;
      while (mountedRef.current) {
        if (playHeadRef.current >= bufferRef.current.length) {
          // If stream ended and no more events, stop
          if (streamEndedRef.current) {
            if (!bufferRef.current.some(e => e.type === "done")) {
              dispatchEvent("done", { totalTokens: 0, estimatedCost: 0 });
            }
            break;
          }
          idleCount++;
          if (idleCount > 600) break; // 60s max idle → abort
          await new Promise(r => setTimeout(r, 100));
          continue;
        }
        idleCount = 0;

        const { type, data } = bufferRef.current[playHeadRef.current++];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatchEvent(type, data as any);
        recordRef.current.push({ type, data, delayMs: Date.now() - startTimeRef.current });

        // Timing control — client dictates the pace
        if (type === "speaking") {
          const nextReady = playHeadRef.current < bufferRef.current.length;
          const isLongThink = (data as {thinkTime?: string}).thinkTime === "long";
          const baseWait = nextReady ? 600 : 1500;
          await new Promise(r => setTimeout(r, isLongThink ? baseWait * 2.5 : baseWait));
        } else if (type === "sentence") {
          const charCount = ((data as {text?: string}).text || "").length;
          await new Promise(r => setTimeout(r, charCount * 110 + 500)); // typing time + pause
        } else if (type === "interrupt") {
          await new Promise(r => setTimeout(r, 800));
        }
        // states, reaction, consensus, progress, status, heartbeat, final, done → no wait

        if (type === "done" || type === "error") {
          playingRef.current = false;
          break;
        }
      }
    }

    loop();
  }, [dispatchEvent]);

  const start = useCallback(async (modelId: string) => {
    setAgentStates({}); setSpeakingAgent(null); setSentences({}); setInterruptInfo(null);
    setReactions([]); setFinalResult(null); setStats(null);
    setStatus("streaming"); setError(null); setStatusMessage(""); setProgress(null); setConsensus(null);
    bufferRef.current = []; playHeadRef.current = 0; playingRef.current = false; streamEndedRef.current = false;
    recordRef.current = []; startTimeRef.current = Date.now();

    // Start playback engine (reads from buffer)
    startPlayback();

    // Start SSE intake (fills buffer)
    try {
      const res = await fetch("/api/executor/debate-live", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, thinkModelId: "gemini-3.1-flash-lite-preview", team: teamRef.current }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        let ev = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { ev = line.slice(7).trim(); }
          else if (line.startsWith("data: ") && ev) {
            try {
              const d = JSON.parse(line.slice(6));
              bufferRef.current.push({ type: ev, data: d });
            } catch { /* skip malformed JSON */ }
            ev = "";
          }
        }
      }
      streamEndedRef.current = true;
    } catch (err) {
      bufferRef.current.push({ type: "error", data: { error: err instanceof Error ? err.message : String(err) } });
      streamEndedRef.current = true;
    }
  }, [startPlayback]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const reset = useCallback(() => {
    playingRef.current = false;
    setAgentStates({}); setSpeakingAgent(null); setSentences({}); setInterruptInfo(null);
    setReactions([]); setFinalResult(null); setStats(null);
    setStatus("idle"); setError(null); setStatusMessage(""); setProgress(null); setConsensus(null);
    setDebatePhase({ phase: "opening", intensity: 1 }); setKeyMoment(null); setConcession(null);
  }, []);

  const saveRecording = useCallback(() => {
    const data = { version: 1, recordedAt: new Date().toISOString(), events: recordRef.current };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `debate-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const replay = useCallback((data: { events: RecordedEvent[] }) => {
    reset();
    setTimeout(() => {
      setStatus("streaming");
      bufferRef.current = data.events.map(e => ({ type: e.type, data: e.data }));
      playHeadRef.current = 0;
      startTimeRef.current = Date.now();
      recordRef.current = [];
      startPlayback();
    }, 50);
  }, [reset, startPlayback]);

  const stopReplay = useCallback(() => {
    playingRef.current = false;
  }, []);

  return { agentStates, speakingAgent, sentences, interruptInfo, reactions, finalResult, stats, status, error, statusMessage, progress, consensus, debatePhase, keyMoment, concession, start, reset, saveRecording, replay, stopReplay, setTeam };
}

/* ── Evaluations (종합 대시보드) ── */

function useEvaluations() {
  const [evaluations, setEvaluations] = useState<ParticipantEvaluation[]>(() =>
    DEFAULT_PARTICIPANTS.map(p => {
      return { participant: p, rounds: [], overallGrade: "C" as Grade, status: "active" as const, executorNotes: "", announcement: "" };
    })
  );

  const submitScore = useCallback((participantId: string, score: RoundScore) => {
    setEvaluations(prev => prev.map(ev => {
      if (ev.participant.id !== participantId) return ev;
      const idx = ev.rounds.findIndex(r => r.roundId === score.roundId);
      const newRounds = idx >= 0 ? ev.rounds.map((r, i) => i === idx ? score : r) : [...ev.rounds, score];
      const overallGrade = computeOverallGrade(newRounds);
      return { ...ev, rounds: newRounds, overallGrade, status: getGradeStatus(overallGrade), announcement: generateAnnouncement(ev.participant, overallGrade) };
    }));
  }, []);

  return { evaluations, submitScore };
}

/* ── Sheet Sync ── */

function useSheetSync(intervalMs = 15000) {
  const [observations, setObservations] = useState<ParticipantObservations[]>([]);
  const [sheetStatus, setSheetStatus] = useState<"idle" | "loading" | "ok" | "error" | "no-sheet">("idle");
  const [totalRows, setTotalRows] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOnce = useCallback(async () => {
    setSheetStatus("loading");
    try {
      const res = await fetch("/api/executor/sheet");
      const json = await res.json();
      if (json.error?.includes("not configured")) { setSheetStatus("no-sheet"); return; }
      if (!res.ok || json.error) { setSheetStatus("error"); return; }
      setObservations(json.observations); setTotalRows(json.rowCount ?? 0); setSheetStatus("ok");
    } catch { setSheetStatus("error"); }
  }, []);

  const startAutoSync = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchOnce(); timerRef.current = setInterval(fetchOnce, intervalMs);
  }, [fetchOnce, intervalMs]);

  const stopAutoSync = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return { observations, sheetStatus, totalRows, fetchOnce, startAutoSync, stopAutoSync };
}

/* ══════════════════════════════════════
   Shared Components
   ══════════════════════════════════════ */

function gradeColor(g: Grade) { return GRADE_COLORS[g]; }

function countChars(t: string) { return t.replace(/\s/g, "").length; }

function BrandingBar() {
  return (
    <div className="exec-brand">
      <div className="exec-brand-left">
        <img src="/jtbc.png" alt="JTBC" className="exec-brand-logo" />
        <div className="exec-brand-divider" />
        <div className="exec-brand-show">
          <span className="exec-brand-show-title">할루시네이션</span>
          <span className="exec-brand-show-sub">해고전쟁</span>
        </div>
      </div>
      <div className="exec-brand-center">
        <span className="exec-brand-company">ORBIT CONSULTING</span>
        <span className="exec-brand-tagline">인공지능 vs 인간 — 실무 검증 프로그램</span>
      </div>
      <div className="exec-brand-right">
        <img src="/kisti.svg" alt="KISTI" className="exec-brand-logo-kisti" />
        <div className="exec-brand-divider" />
        <div className="exec-brand-org">
          <span className="exec-brand-org-dept">글로벌R&D분석센터</span>
        </div>
      </div>
    </div>
  );
}

type AppMode = "debate" | "dashboard" | "announce";

function ModeTabBar({
  mode, onChange, debateCompleted, evalCount, ttsActive
}: {
  mode: AppMode;
  onChange: (m: AppMode) => void;
  debateCompleted: number;
  evalCount: number;
  ttsActive: boolean;
}) {
  const [showExtra, setShowExtra] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setShowExtra(prev => !prev);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <nav className="exec-mode-nav">
      <button className={`exec-mode-tab ${mode === "debate" ? "active" : ""}`} data-mode="debate" onClick={() => onChange("debate")}>
        <span className="exec-mode-icon">⚔</span>
        <span className="exec-mode-label">토론 배틀</span>
        {debateCompleted > 0 && <span className="exec-mode-badge">{debateCompleted}/3</span>}
      </button>
      {showExtra && (
        <>
          <button className={`exec-mode-tab ${mode === "dashboard" ? "active" : ""}`} data-mode="dashboard" onClick={() => onChange("dashboard")}>
            <span className="exec-mode-icon">📊</span>
            <span className="exec-mode-label">종합 대시보드</span>
          </button>
          <button className={`exec-mode-tab ${mode === "announce" ? "active" : ""}`} data-mode="announce" onClick={() => onChange("announce")}>
            <span className="exec-mode-icon">📢</span>
            <span className="exec-mode-label">최종 발표</span>
            {ttsActive && <span className="exec-mode-live">LIVE</span>}
          </button>
        </>
      )}
    </nav>
  );
}

function AITeamBanner() {
  return (
    <div className="exec-vs-banner" style={{ justifyContent: "center" }}>
      <div className="exec-vs-team exec-vs-ai">
        <div className="exec-vs-team-label">AI TEAM — ARCHE</div>
        <div className="exec-vs-chips">
          {AI_AGENT_PERSONAS.map(a => (
            <div key={a.id} className="exec-vs-chip exec-vs-chip-ai">
              <span className="exec-vs-ai-id">{a.id.toUpperCase()}</span>
              <span className="exec-vs-name">{a.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Mode: 토론 배틀 (라이브 토론)
   ══════════════════════════════════════ */

function DebateMode({ selectedModel, setSelectedModel, onComplete, tts }: {
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  onComplete: (done: boolean) => void;
  tts: ReturnType<typeof useTTS>;
}) {
  const topic = DEBATE_TOPICS[2];
  const debate = useDebateLive();
  const [showSettings, setShowSettings] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(110);
  const [showLog, setShowLog] = useState(false);
  const [currentTeam, setCurrentTeam] = useState<"A" | "B">("A");
  const fileRef = useRef<HTMLInputElement>(null);

  const startLive = useCallback(() => { debate.start(selectedModel); }, [selectedModel, debate]);
  const handleReset = useCallback(() => { debate.stopReplay(); debate.reset(); }, [debate]);

  useEffect(() => { if (debate.status === "done") onComplete(true); }, [debate.status, onComplete]);

  // Hidden settings shortcut: Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.key === "D") setShowSettings(p => !p); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleLoadReplay = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.events) debate.replay(data);
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [debate]);

  return (
    <div className="exec-debate-mode exec-debate-zoom">
      {/* Compact header */}
      <div className="exec-zoom-header">
        <div className="exec-zoom-topic">
          <span className="exec-debate-category">{topic.category}</span>
          <span className="exec-zoom-title">{topic.title}</span>
        </div>
        <div className="exec-zoom-controls">
          {debate.status === "idle" && <button className="exec-btn-run" onClick={startLive}>AI 토론 시작</button>}
          {debate.status === "streaming" && (
            <>
              <span className="exec-streaming-dot" />
              <span className="exec-live-tag">LIVE</span>
              {debate.progress && <span className="exec-turn-count">턴 {debate.progress.turn}/{debate.progress.maxTurns}</span>}
              {debate.statusMessage && <span className="exec-status-msg">{debate.statusMessage}</span>}
            </>
          )}
          {debate.status === "done" && <span className="exec-live-done-badge">완료 {debate.stats?.turns}턴</span>}
          {debate.status !== "idle" && <button className="exec-btn exec-btn-ghost" onClick={handleReset}>초기화</button>}
          <button className="exec-btn exec-btn-ghost" onClick={() => setShowSettings(p => !p)} title="설정 (Ctrl+Shift+D)">⚙</button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="exec-hidden-settings">
          <div className="exec-settings-row">
            <label>페르소나 팀</label>
            <div className="exec-filter-btns">
              <button className={`exec-filter-btn ${currentTeam === "A" ? "active" : ""}`}
                onClick={() => { setCurrentTeam("A"); debate.setTeam("A"); }}>A 신중론</button>
              <button className={`exec-filter-btn ${currentTeam === "B" ? "active" : ""}`}
                onClick={() => { setCurrentTeam("B"); debate.setTeam("B"); }}>B 혁신론</button>
            </div>
          </div>
          <div className="exec-settings-row">
            <label>발언 모델</label>
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
              className="exec-model-dropdown" disabled={debate.status === "streaming"}>
              {MODEL_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="exec-settings-row">
            <label>불러오기</label>
            <input ref={fileRef} type="file" accept=".json" onChange={handleLoadReplay} />
          </div>
          <div className="exec-settings-row">
            <label>내보내기</label>
            <button className="exec-btn exec-btn-ghost" onClick={() => debate.saveRecording()} disabled={debate.status !== "done"}>토론 데이터 저장</button>
          </div>
          <div className="exec-settings-row">
            <label>타이핑 속도</label>
            <input type="range" min="0" max="150" step="10" value={typingSpeed}
              onChange={e => setTypingSpeed(Number(e.target.value))} style={{ width: 80 }} />
            <span style={{ fontSize: "0.7rem", color: "var(--exec-muted)" }}>
              {typingSpeed === 0 ? "즉시" : `${typingSpeed}ms`}
            </span>
          </div>
          {debate.status === "done" && (
            <div className="exec-settings-row">
              <button className="exec-btn exec-btn-ghost" onClick={() => setShowLog(p => !p)}>
                {showLog ? "타임라인 닫기" : "전체 타임라인"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Topic description — always visible */}
      <div className="exec-zoom-topic-desc">
        {topic.description}
        {debate.status === "streaming" && (
          <span className={`exec-phase-badge phase-${debate.debatePhase?.phase || "opening"}`}>
            {debate.debatePhase?.phase === "opening" ? "도입" : debate.debatePhase?.phase === "developing" ? "전개" : debate.debatePhase?.phase === "heated" ? "격론" : "수렴"}
          </span>
        )}
      </div>

      {/* Key moment / concession banners */}
      {debate.keyMoment && (
        <div className="exec-moment-banner exec-moment-key">
          ⭐ 핵심 발언: {debate.keyMoment.description}
        </div>
      )}
      {debate.concession && (
        <div className="exec-moment-banner exec-moment-concession">
          🤝 양보: {AI_AGENT_PERSONAS.find(a => a.id === debate.concession?.from)?.role} → {AI_AGENT_PERSONAS.find(a => a.id === debate.concession?.to)?.role} ({debate.concession.point})
        </div>
      )}

      {/* Tug-of-war momentum */}
      {debate.consensus && debate.consensus.direction !== "none" && debate.status === "streaming" && (() => {
        const dir = debate.consensus!.direction;
        const isAgree = dir === "leaning_agree" || dir === "agreed";
        const isTied = dir === "tied";
        const agreeRatio = debate.consensus!.agree_count / Math.max(1, debate.consensus!.agree_count + debate.consensus!.disagree_count) * 100;
        return (
          <div className="exec-tugofwar">
            <span className="exec-tug-label tug-agree">찬성 {debate.consensus!.agree_count}</span>
            <div className="exec-tug-bar">
              <div className="exec-tug-agree" style={{ width: `${agreeRatio}%` }} />
              <div className="exec-tug-disagree" style={{ width: `${100 - agreeRatio}%` }} />
              <div className="exec-tug-divider" style={{ left: `${agreeRatio}%` }} />
            </div>
            <span className="exec-tug-label tug-disagree">{debate.consensus!.disagree_count} 반대</span>
            <span className={`exec-tug-direction ${isTied ? "tied" : isAgree ? "agree" : "disagree"}`}>
              {isTied ? "팽팽" : isAgree ? "찬성 우세" : "반대 우세"}
            </span>
          </div>
        );
      })()}

      {/* Timeline log */}
      {showLog && debate.status === "done" && (
        <div className="exec-timeline-log">
          {Object.entries(debate.sentences).map(([agentId, sents]) => {
            const ag = AI_AGENT_PERSONAS.find(a => a.id === agentId);
            return sents.map((s, i) => (
              <div key={`${agentId}-${i}`} className="exec-log-entry">
                <span className="exec-log-agent">{ag?.role}</span>
                <span className="exec-log-text">{s}</span>
              </div>
            ));
          })}
        </div>
      )}

      {debate.status === "error" && (
        <div className="exec-debate-error">
          <span>오류: {debate.error}</span>
          <button className="exec-btn exec-btn-ghost" onClick={handleReset}>다시 시도</button>
        </div>
      )}

      {/* Zoom Grid — always visible */}
      <ZoomGrid
        agentStates={debate.agentStates}
        speakingAgent={debate.speakingAgent}
        sentences={debate.sentences}
        interruptInfo={debate.interruptInfo}
        reactions={debate.reactions}
        finalResult={debate.finalResult}
        stats={debate.stats}
        status={debate.status}
        tts={tts}
        typingSpeed={typingSpeed}
      />
    </div>
  );
}

function AgentPanel({ agent, state, isSpeaking, isInterrupted, isInterrupter, agentSentences, speakCount, receivedReactions, latestGivenEmoji, latestGivenTarget, isStreaming, typingSpeed }: {
  agent: typeof AI_AGENT_PERSONAS[number];
  state?: AgentInternalState;
  isSpeaking: boolean;
  isInterrupted: boolean;
  isInterrupter: boolean;
  agentSentences: string[];
  speakCount: number;
  receivedReactions: ReactionEvent[];
  latestGivenEmoji?: string;
  latestGivenTarget?: string;
  isStreaming: boolean;
  typingSpeed: number;
}) {
  const fullText = agentSentences.map(s => s === "__BREAK__" ? "\n\n" : s).join(" ").replace(/ \n\n /g, "\n\n");
  const [shownChars, setShownChars] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSpeaking) return;
    if (shownChars >= fullText.length) return;
    const t = setTimeout(() => setShownChars(p => p + 1), typingSpeed);
    return () => clearTimeout(t);
  }, [isSpeaking, shownChars, fullText, typingSpeed]);

  // Auto-scroll panel body to bottom
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [shownChars, agentSentences.length]);

  const typedText = isSpeaking ? fullText.slice(0, shownChars) : "";
  const isTyping = isSpeaking && fullText.length > 0 && shownChars < fullText.length;
  const hasSpoken = agentSentences.length > 0;

  const posLabel = state?.position === "agree" ? "찬성" : state?.position === "disagree" ? "반대" : state?.position === "conditional" ? "조건부" : "";

  let panelClass = "exec-agent-panel";
  if (isSpeaking && isInterrupter) panelClass += " interrupt speaking";
  else if (isSpeaking) panelClass += " speaking";
  else if (isInterrupted) panelClass += " interrupted";
  if (state?.emotion === "agitated") panelClass += " agitated";
  if (state?.emotion === "passionate") panelClass += " passionate";

  return (
    <div className={panelClass}>
      {/* Header: name + position + status */}
      <div className="exec-panel-header">
        <span className="exec-panel-role">{agent.role}</span>
        {posLabel && <span className={`exec-panel-pos ${state?.position}`}>{posLabel}</span>}
        {speakCount > 0 && <span className="exec-panel-speak-count">{speakCount}회</span>}
        {isSpeaking && !isInterrupter && <span className="exec-panel-mic">🎙</span>}
        {isInterrupter && <span className="exec-panel-interrupt-tag">⚡ INTERRUPT</span>}
        {isInterrupted && <span className="exec-panel-cut-tag">중단됨</span>}
        {!isSpeaking && latestGivenEmoji && latestGivenTarget && isStreaming && (
          <span className="exec-panel-given-reaction">{latestGivenEmoji}→{latestGivenTarget}</span>
        )}
      </div>

      {/* Thought bar (below header, above body) */}
      {!isSpeaking && !isInterrupted && state?.thought && state.thought !== "토론 종료" && isStreaming && (
        <div className="exec-panel-thought-bar">💭 {state.thought}</div>
      )}

      <div className="exec-panel-body" ref={bodyRef}>
        {/* Speaking: typing effect */}
        {isSpeaking && fullText.length > 0 && (
          <div className="exec-panel-speech">
            {typedText}
            {isTyping && <span className="exec-typing-cursor" />}
          </div>
        )}

        {/* Thinking dots */}
        {isSpeaking && fullText.length === 0 && (
          <div className="exec-panel-thinking"><div className="exec-typing-dots"><span /><span /><span /></div></div>
        )}

        {/* Interrupted */}
        {isInterrupted && hasSpoken && (
          <div className="exec-panel-speech exec-panel-interrupted">
            {fullText}
            <span className="exec-cut-mark"> [발언 중단됨]</span>
          </div>
        )}

        {/* Not speaking: past text dimmed (last turn only) */}
        {!isSpeaking && !isInterrupted && hasSpoken && (
          <div className="exec-panel-speech exec-panel-past">
            {agentSentences.filter(s => s !== "__BREAK__").slice(-3).join(" ")}
          </div>
        )}

        {/* Empty */}
        {!isSpeaking && !isInterrupted && !hasSpoken && !state && (
          <div className="exec-panel-standby" />
        )}
      </div>

      {/* Received reactions at bottom */}
      {receivedReactions.length > 0 && (
        <div className="exec-panel-reactions">
          {receivedReactions.slice(-5).map((r, i) => {
            const from = AI_AGENT_PERSONAS.find(a => a.id === r.agentId);
            return <span key={i} className="exec-panel-reaction" title={from?.role}>{r.emoji}</span>;
          })}
        </div>
      )}
    </div>
  );
}

function ZoomGrid({ agentStates, speakingAgent, sentences, interruptInfo, reactions, finalResult, stats, status, tts, typingSpeed }: {
  agentStates: Record<string, AgentInternalState>;
  speakingAgent: string | null;
  sentences: Record<string, string[]>;
  interruptInfo: InterruptEvent | null;
  reactions: ReactionEvent[];
  finalResult: { content: string; chars: number } | null;
  stats: { totalTokens: number; estimatedCost: number; model?: string; turns?: number } | null;
  status: string;
  tts: ReturnType<typeof useTTS>;
  typingSpeed: number;
}) {
  return (
    <div className="exec-zoom-grid">
      {AI_AGENT_PERSONAS.map(agent => {
        const givenReactions = reactions.filter(r => r.agentId === agent.id);
        const latestGiven = givenReactions[givenReactions.length - 1];
        const targetAgent = latestGiven ? AI_AGENT_PERSONAS.find(a => a.id === latestGiven.targetId) : null;
        return (
          <AgentPanel
            key={agent.id}
            agent={agent}
            state={agentStates[agent.id]}
            isSpeaking={speakingAgent === agent.id}
            isInterrupted={interruptInfo?.target === agent.id}
            isInterrupter={interruptInfo?.by === agent.id && speakingAgent === agent.id}
            agentSentences={sentences[agent.id] || []}
            speakCount={Math.ceil((sentences[agent.id] || []).length / 3)}
            receivedReactions={reactions.filter(r => r.targetId === agent.id)}
            latestGivenEmoji={latestGiven?.emoji}
            latestGivenTarget={targetAgent?.role}
            isStreaming={status === "streaming"}
            typingSpeed={typingSpeed}
          />
        );
      })}

      {/* Final: philosopher panel gets gold highlight, overlay shows summary */}
      {finalResult && (
        <div className="exec-zoom-final">
          <div className="exec-zoom-final-content">
            <span className="exec-zoom-final-label">철학자 종합</span>
            <p>{finalResult.content}</p>
            <div className="exec-zoom-final-meta">
              <span>{finalResult.chars}자</span>
              <button className="exec-tts-btn" onClick={() => tts.speak(finalResult.content)} disabled={tts.isSpeaking}>읽어주기</button>
              <button className="exec-btn exec-btn-ghost" onClick={() => {
                const el = document.querySelector(".exec-zoom-final");
                if (el) (el as HTMLElement).style.display = "none";
              }}>패널로 돌아가기</button>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="exec-zoom-stats">
          {stats.model && <span>{stats.model}</span>}
          <span>{stats.totalTokens.toLocaleString()} tok</span>
          <span>${stats.estimatedCost.toFixed(4)}</span>
          {stats.turns && <span>{stats.turns}턴</span>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   Mode: 종합 대시보드
   ══════════════════════════════════════ */

function DashboardMode({
  evaluations, submitScore, observations, sheetStatus, totalRows, fetchOnce, onAiEval
}: {
  evaluations: ParticipantEvaluation[];
  submitScore: (pid: string, s: RoundScore) => void;
  observations: ParticipantObservations[];
  sheetStatus: string;
  totalRows: number;
  fetchOnce: () => void;
  onAiEval: (data: Record<string, { grade: string; evaluation: string; oneliner: string }>) => void;
}) {
  const [currentRound, setCurrentRound] = useState(0);
  const [scoringTarget, setScoringTarget] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const round = ROUND_LABELS[currentRound];
  const sorted = [...evaluations].sort((a, b) => GRADE_ORDER[b.overallGrade] - GRADE_ORDER[a.overallGrade]);

  const runFinalEvaluation = useCallback(async () => {
    if (observations.length === 0) { alert("관찰 데이터를 먼저 SYNC하세요."); return; }
    setGenerating(true);
    const results: Record<string, { grade: string; evaluation: string; oneliner: string }> = {};

    for (const ev of evaluations) {
      const obs = observations.find(o => o.name === ev.participant.name);
      if (!obs || obs.totalCount === 0) continue;
      setGenProgress(`${ev.participant.name} 평가 생성 중...`);
      try {
        const res = await fetch("/api/executor/evaluate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantName: ev.participant.name, observations: obs }),
        });
        const data = await res.json();
        results[ev.participant.id] = data;
      } catch { /* skip */ }
    }

    onAiEval(results);
    setGenerating(false);
    setGenProgress("");
    alert("AI 최종 평가가 생성되었습니다. '최종 발표' 탭에서 확인하세요.");
  }, [evaluations, observations, onAiEval]);

  return (
    <div className="exec-dash-mode">
      {/* Round Timeline */}
      <div className="exec-round-timeline">
        {ROUND_LABELS.map((r, i) => (
          <button key={r.id} className={`exec-round-step ${i === currentRound ? "active" : ""} ${i < currentRound ? "done" : ""}`}
            onClick={() => setCurrentRound(i)}>
            <span className="exec-round-step-num">{i + 1}</span>
            <span className="exec-round-step-label">{r.label.replace(/실무[①-⑦]\s*/, "")}</span>
            <span className="exec-round-step-loc">{r.location}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="exec-dash-toolbar">
        <span className="exec-dash-round-title">{round.label}</span>
        <button className="exec-btn exec-btn-ghost" onClick={fetchOnce}>
          SYNC ({sheetStatus === "ok" ? `${totalRows}건` : sheetStatus})
        </button>
        <button className="exec-btn exec-btn-primary" onClick={runFinalEvaluation}
          disabled={generating || observations.length === 0}>
          {generating ? genProgress : "AI 최종 평가 생성"}
        </button>
      </div>

      {/* Participant Cards */}
      <div className="exec-dash-grid">
        {sorted.map((ev, idx) => {
          const obs = observations.find(o => o.name === ev.participant.name);
          return (
            <div key={ev.participant.id} className={`exec-dash-card exec-status-${ev.status}`}>
              <div className="exec-dash-rank">#{idx + 1}</div>
              <div className="exec-dash-avatar" style={{ borderColor: gradeColor(ev.overallGrade) }}>{ev.participant.avatar}</div>
              <div className="exec-dash-name">{ev.participant.name}</div>
              <div className="exec-dash-title">{ev.participant.title} · {ev.participant.department}</div>
              <div className="exec-dash-grade" style={{ color: gradeColor(ev.overallGrade) }}>{ev.overallGrade}등급</div>
              <div className={`exec-dash-status exec-dash-status-${ev.status}`}>
                {ev.status === "active" ? "재직" : ev.status === "warning" ? "경고" : "해고"}
              </div>

              {/* Round dots */}
              <div className="exec-dash-dots">
                {ev.rounds.map(r => (
                  <span key={r.roundId} className="exec-dash-dot" style={{ background: gradeColor(r.overallGrade) }} title={`${r.roundLabel}: ${r.overallGrade}`}>
                    {r.overallGrade}
                  </span>
                ))}
              </div>

              {/* AI aptitude */}
              <div className="exec-dash-apt">AI 적합도 {ev.participant.aiAptitude.score}% · {ev.participant.aiAptitude.category}</div>

              {/* Observation data from sheet */}
              {obs && obs.totalCount > 0 && (
                <div className="exec-dash-obs-detail">
                  <div className="exec-dash-obs-count">{obs.totalCount}건 관찰</div>
                  <div className="exec-dash-obs-recommend">
                    AI 추천: <span style={{ color: gradeColor(obs.recommendedGrade as Grade), fontWeight: 700 }}>{obs.recommendedGrade}등급</span>
                  </div>
                  <div className="exec-dash-obs-tags">
                    {Object.entries(obs.tagCounts).slice(0, 5).map(([tag, count]) => (
                      <span key={tag} className="exec-dash-tag">{tag} {count}</span>
                    ))}
                  </div>
                </div>
              )}

              <button className="exec-dash-eval-btn" onClick={() => setScoringTarget(ev.participant.id)}>EVALUATE</button>
            </div>
          );
        })}
      </div>

      {/* Scoring Overlay */}
      {scoringTarget && (() => {
        const ev = evaluations.find(e => e.participant.id === scoringTarget)!;
        const obs = observations.find(o => o.name === ev.participant.name);
        const recommended = obs ? computeDimensionGrades(obs) : undefined;
        return (
          <div className="exec-overlay" onClick={e => { if (e.target === e.currentTarget) setScoringTarget(null); }}>
            <ScoringPanel
              participant={ev.participant}
              roundId={round.id} roundLabel={round.label}
              recommended={recommended}
              onSubmit={score => { submitScore(scoringTarget, score); setScoringTarget(null); }}
              onCancel={() => setScoringTarget(null)}
            />
          </div>
        );
      })()}
    </div>
  );
}

function ScoringPanel({ participant, roundId, roundLabel, recommended, onSubmit, onCancel }: {
  participant: Participant; roundId: string; roundLabel: string;
  recommended?: Record<string, string>;
  onSubmit: (s: RoundScore) => void; onCancel: () => void;
}) {
  const [scores, setScores] = useState<Record<string, Grade>>(() =>
    Object.fromEntries(EVAL_DIMENSIONS.map(d => [
      d.key,
      (recommended?.[d.key] as Grade) || ("C" as Grade)
    ]))
  );
  const [note, setNote] = useState("");
  const overall = computeRoundGrade(scores);

  const applyAllRecommended = useCallback(() => {
    if (!recommended) return;
    setScores(Object.fromEntries(EVAL_DIMENSIONS.map(d => [
      d.key, (recommended[d.key] as Grade) || "C"
    ])));
  }, [recommended]);

  return (
    <div className="exec-scoring">
      <div className="exec-scoring-head">
        <h3>{participant.avatar} {participant.name} {participant.title} — {roundLabel}</h3>
        <span style={{ color: gradeColor(overall), fontSize: "1.4rem", fontWeight: 700 }}>{overall}</span>
      </div>
      {recommended && (
        <div className="exec-scoring-recommend">
          <span>AI 추천 등급이 반영되어 있습니다. 수정이 필요한 항목만 변경하세요.</span>
          <button className="exec-btn exec-btn-ghost" onClick={applyAllRecommended}>추천 초기화</button>
        </div>
      )}
      {EVAL_DIMENSIONS.map(dim => (
        <div key={dim.key} className="exec-dim-row">
          <div className="exec-dim-info">
            <span className="exec-dim-name">{dim.label}</span>
            <span className="exec-dim-val" style={{ color: gradeColor(scores[dim.key]) }}>{scores[dim.key]}</span>
            {recommended?.[dim.key] && recommended[dim.key] !== scores[dim.key] && (
              <span className="exec-dim-ai-hint" title="AI 추천">AI:{recommended[dim.key]}</span>
            )}
          </div>
          <div className="exec-dim-btns">
            {ALL_GRADES.map(g => (
              <button key={g} className={`exec-dim-btn ${scores[dim.key] === g ? "sel" : ""}`}
                style={scores[dim.key] === g ? { borderColor: gradeColor(g), background: `${gradeColor(g)}20` } : {}}
                onClick={() => setScores(prev => ({ ...prev, [dim.key]: g }))}>{g}</button>
            ))}
          </div>
        </div>
      ))}
      <textarea className="exec-note" placeholder="집행관 메모" value={note} onChange={e => setNote(e.target.value)} rows={2} />
      <div className="exec-scoring-actions">
        <button className="exec-btn exec-btn-primary" onClick={() => onSubmit({
          roundId, roundLabel, scores, overallGrade: overall, note, timestamp: new Date().toISOString()
        })}>등급 확정</button>
        <button className="exec-btn exec-btn-ghost" onClick={onCancel}>취소</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Mode: 최종 발표
   ══════════════════════════════════════ */

/* ── 7각형 레이더 차트 ── */
function RadarChart({ scores, color }: { scores: Record<string, string>; color: string }) {
  const dims = EVAL_DIMENSIONS;
  const n = dims.length;
  const cx = 100, cy = 100, r = 80;
  const gradeVal: Record<string, number> = { S: 1, A: 0.85, B: 0.7, C: 0.5, D: 0.3, F: 0.1 };

  // Polygon points for the background rings
  const ringPoints = (radius: number) =>
    dims.map((_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
    }).join(" ");

  // Data polygon
  const dataPoints = dims.map((d, i) => {
    const val = gradeVal[scores[d.key] || "C"] || 0.5;
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return `${cx + r * val * Math.cos(angle)},${cy + r * val * Math.sin(angle)}`;
  }).join(" ");

  // Labels
  const labels = dims.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lx = cx + (r + 18) * Math.cos(angle);
    const ly = cy + (r + 18) * Math.sin(angle);
    const grade = scores[d.key] || "C";
    return { x: lx, y: ly, label: d.label.replace(/\s/g, "").slice(0, 4), grade };
  });

  return (
    <svg viewBox="0 0 200 200" className="exec-radar-chart">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map(scale => (
        <polygon key={scale} points={ringPoints(r * scale)} className="exec-radar-ring" />
      ))}
      {/* Axis lines */}
      {dims.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} className="exec-radar-axis" />;
      })}
      {/* Data area */}
      <polygon points={dataPoints} fill={`${color}30`} stroke={color} strokeWidth="2" className="exec-radar-data" />
      {/* Data points */}
      {dims.map((d, i) => {
        const val = gradeVal[scores[d.key] || "C"] || 0.5;
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <circle key={i} cx={cx + r * val * Math.cos(angle)} cy={cy + r * val * Math.sin(angle)} r="3" fill={color} />;
      })}
      {/* Labels */}
      {labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} className="exec-radar-label" textAnchor="middle" dominantBaseline="middle">
          {l.label} {l.grade}
        </text>
      ))}
    </svg>
  );
}

function GradeRoulette({ finalGrade, rounds, dimensions, aiEval, participant }: {
  finalGrade: string;
  rounds: RoundScore[];
  dimensions: typeof EVAL_DIMENSIONS;
  aiEval?: { grade: string; evaluation: string; oneliner: string };
  participant: Participant;
}) {
  const [phase, setPhase] = useState<"spinning" | "slowing" | "locked">("spinning");
  const [displayGrade, setDisplayGrade] = useState("S");
  const [flashItems, setFlashItems] = useState<string[]>([]);

  useEffect(() => {
    // Build flash content from all available data
    const items: string[] = [];
    // From round scores
    for (const r of rounds) {
      for (const d of dimensions) {
        if (r.scores[d.key]) items.push(`${d.label}: ${r.scores[d.key]}`);
      }
    }
    // From AI evaluation text (split into phrases)
    if (aiEval?.evaluation) {
      const phrases = aiEval.evaluation.split(/[.,!?]/).filter(s => s.trim().length > 3).map(s => s.trim());
      items.push(...phrases);
    }
    // From participant info
    items.push(`AI 적합도: ${participant.aiAptitude.score}%`);
    items.push(participant.aiAptitude.category);
    // Dimension labels as fillers
    for (const d of dimensions) items.push(d.label);
    if (items.length === 0) items.push("평가 중...", "데이터 분석 중...", "등급 산출 중...");

    let idx = 0;
    const spinInterval = setInterval(() => {
      setDisplayGrade(ALL_GRADES[idx % ALL_GRADES.length]);
      setFlashItems(prev => {
        const next = [...prev, items[idx % items.length]];
        return next.slice(-5);
      });
      idx++;
    }, 80);

    const slowTimer = setTimeout(() => {
      clearInterval(spinInterval);
      setPhase("slowing");
      let slowIdx = 0;
      const slowInterval = setInterval(() => {
        const grades = [...ALL_GRADES, ...ALL_GRADES, finalGrade];
        setDisplayGrade(grades[slowIdx % grades.length]);
        slowIdx++;
        if (slowIdx > 8) {
          clearInterval(slowInterval);
          setDisplayGrade(finalGrade);
          setPhase("locked");
        }
      }, 200 + slowIdx * 40);
    }, 2000);

    return () => { clearInterval(spinInterval); clearTimeout(slowTimer); };
  }, [finalGrade, rounds, dimensions, aiEval, participant]);

  return (
    <div className={`exec-grade-roulette ${phase}`}>
      <div className="exec-roulette-flash-items">
        {flashItems.map((item, i) => (
          <span key={i} className="exec-roulette-flash-item">{item}</span>
        ))}
      </div>
      <div className={`exec-roulette-grade-display ${phase}`} style={{ color: phase === "locked" ? gradeColor(finalGrade as Grade) : "var(--exec-gold)" }}>
        {displayGrade}
      </div>
      {phase === "locked" && (
        <div className="exec-roulette-locked-label">등급 확정</div>
      )}
    </div>
  );
}

/* ── config.js FINAL_VERDICTS 기반 최종 발표 ── */
const VERDICT_PEOPLE = [
  { id:'p1', name:'하석진', title:'차장', dept:'미래전략기획실' },
  { id:'p5', name:'곽재식', title:'과장', dept:'품질관리팀' },
  { id:'p2', name:'황제성', title:'대리', dept:'글로벌영업팀' },
  { id:'p3', name:'츠키',   title:'주임', dept:'인사팀' },
  { id:'p6', name:'가온',   title:'사원', dept:'홍보마케팅팀' },
  { id:'p4', name:'허성범', title:'인턴', dept:'인사팀' },
];
const VERDICT_ORDER = ['p1','p5','p2','p3','p6','p4']; // 직급순
const VERDICT_FIRED = ['p2','p3','p6'];
const VERDICT_RETAINED = ['p5','p1','p4'];
const VERDICT_DATA: Record<string, { evaluation: string; oneliner: string; conclusion: string; order: string }> = {
  p5: { evaluation:'실무 1부터 실무 7까지, 당신은 처음부터 끝까지 흔들리지 않았습니다. 역량 평가와 윤리적 책임감, 두 항목에서 최고 등급을 받은 사람은 당신뿐입니다.', oneliner:'이번엔 살아남았습니다. 하지만 혼자 옳다고 믿는 사람은, 다음엔 혼자 남습니다.', conclusion:'곽재식 과장은 고용 유지 대상자입니다.', order:'본래의 업무로 복귀하십시오.' },
  p1: { evaluation:'성과 기여도, 역량 평가, 위기 대응력. 세 항목에서 A등급을 받은 것은 당신뿐입니다. 다만 윤리적 책임감이 전체 최하위였다는 점은 기록에 남습니다.', oneliner:'이번엔 살아남았습니다. 하지만 빠르기만 한 칼은 결국 잡은 손도 벱니다.', conclusion:'하석진 차장은 고용 유지 대상자입니다.', order:'본래의 업무로 복귀하십시오.' },
  p4: { evaluation:'경험은 이 자리에서 가장 얕았습니다. 성과 기여도와 협업 태도는 하위권이었습니다. 하지만 AI 검증력에서 유일하게 최고 등급을 받았습니다.', oneliner:'이번엔 그 눈 하나가 당신을 살렸습니다. 눈만 좋고 손이 따라가지 못하면, 다음엔 봐줄 수 없습니다.', conclusion:'허성범 인턴은 고용 유지 대상자입니다.', order:'본래의 업무로 복귀하십시오.' },
  p2: { evaluation:'협업 태도와 인간의 직관력, 두 항목에서 A등급을 받았습니다. 하지만 그 외의 다섯 항목은 모두 C등급이었습니다.', oneliner:'따뜻한 사람이 언제나 필요한 사람은 아닙니다. 분위기를 살리는 것과 성과를 내는 것은 다릅니다.', conclusion:'황제성 대리는 해고 대상자입니다.', order:'지금 바로 오빗 컨설팅을 떠나주십시오.' },
  p3: { evaluation:'협업 태도 A등급. 적응 속도는 인정합니다. 하지만 AI 검증력이 D등급으로 전체 최하위권이었습니다.', oneliner:'기대는 사람은, 기대는 것이 부러지면 함께 쓰러집니다.', conclusion:'츠키 주임은 해고 대상자입니다.', order:'지금 바로 오빗 컨설팅을 떠나주십시오.' },
  p6: { evaluation:'실무 1에서 끝까지 포기하지 않은 것, 태도는 봤습니다. 하지만 성과 기여도 D, 위기 대응력 D, AI 검증력 D.', oneliner:'가능성만으로는 이 자리에 남을 수 없습니다. 결과로 말해야 하는 자리에서, 당신은 아직 말하지 못했습니다.', conclusion:'가온 사원은 해고 대상자입니다.', order:'지금 바로 오빗 컨설팅을 떠나주십시오.' },
};

function AnnounceMode({
  evaluations, tts, aiEvaluations
}: {
  evaluations: ParticipantEvaluation[];
  tts: ReturnType<typeof useTTS>;
  aiEvaluations: Record<string, { grade: string; evaluation: string; oneliner: string }>;
}) {
  const [spotlightIdx, setSpotlightIdx] = useState(-1);
  const [phase, setPhase] = useState<'idle'|'eval'|'oneliner'|'verdict'>('idle');

  const activePid = spotlightIdx >= 0 ? VERDICT_ORDER[spotlightIdx] : null;
  const activePerson = activePid ? VERDICT_PEOPLE.find(p => p.id === activePid) : null;
  const activeVerdict = activePid ? VERDICT_DATA[activePid] : null;
  const isFired = activePid ? VERDICT_FIRED.includes(activePid) : false;
  const gc = isFired ? '#ff2d2d' : '#59d28f';

  const [isSequentialRunning, setIsSequentialRunning] = useState(false);
  const cancelSeqRef = useRef(false);

  // 개별 발표
  const handleSpeak = useCallback(async (idx: number) => {
    const pid = VERDICT_ORDER[idx];
    const v = VERDICT_DATA[pid];
    const p = VERDICT_PEOPLE.find(x => x.id === pid);
    if (!v || !p) return;

    setSpotlightIdx(idx);
    setPhase('eval');
    await tts.speak(v.evaluation);
    setPhase('oneliner');
    await tts.speak(v.oneliner);
    setPhase('verdict');
    await tts.speak(`${v.conclusion} ${v.order}`);
  }, [tts]);

  // 전체 발표
  const handleStartAll = useCallback(async () => {
    cancelSeqRef.current = false;
    setIsSequentialRunning(true);
    await tts.speak("지금부터 최종 인사 발령을 발표합니다.");
    if (cancelSeqRef.current) { setIsSequentialRunning(false); return; }
    await new Promise(r => setTimeout(r, 2000));

    for (let i = 0; i < VERDICT_ORDER.length; i++) {
      if (cancelSeqRef.current) break;
      await handleSpeak(i);
      if (cancelSeqRef.current) break;
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!cancelSeqRef.current) {
      await new Promise(r => setTimeout(r, 1000));
      await tts.speak("이상으로 최종 인사 발령을 마칩니다.");
    }
    setIsSequentialRunning(false);
    setPhase('idle');
  }, [tts, handleSpeak]);

  return (
    <div className="exec-announce-mode">
      {/* Stage */}
      <div className={`exec-stage ${activePerson ? "exec-stage-active" : ""}`}>
        {activePerson && activeVerdict ? (
          <>
            <div className="exec-stage-name">{activePerson.name}</div>
            <div className="exec-stage-title">{activePerson.dept} {activePerson.title}</div>

            <div className="exec-stage-grade" style={{ color: gc, fontSize: 'clamp(3rem, 6vw, 5rem)', fontWeight: 900, textShadow: `0 0 40px ${gc}`, margin: '2vh 0' }}>
              {isFired ? '해고' : '유지'}
            </div>

            <div className="exec-stage-details">
              <div className="exec-stage-text-area">
                {(phase === 'eval' || phase === 'oneliner' || phase === 'verdict') && (
                  <div className="exec-stage-ai-eval" style={{ marginBottom: '1.5vh' }}>{activeVerdict.evaluation}</div>
                )}
                {(phase === 'oneliner' || phase === 'verdict') && (
                  <div className="exec-stage-oneliner" style={{ color: gc, borderLeft: `3px solid ${gc}`, paddingLeft: '1em', margin: '1.5vh 0' }}>
                    {activeVerdict.oneliner}
                  </div>
                )}
                {phase === 'verdict' && (
                  <>
                    <div style={{ fontSize: 'clamp(1.2rem, 1.8vw, 1.6rem)', fontWeight: 900, color: gc, margin: '1.5vh 0' }}>
                      {activeVerdict.conclusion}
                    </div>
                    <div style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                      {activeVerdict.order}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="exec-stage-empty">
            <div className="exec-stage-empty-title">최종 인사 발령</div>
            <div className="exec-stage-empty-sub">발표할 대상을 선택하거나, 전체 발표를 시작하세요</div>
          </div>
        )}
      </div>

      {/* Queue — 직급순 */}
      <div className="exec-announce-queue">
        <div className="exec-announce-queue-header">
          <span>발표 순서 (직급순)</span>
          <div className="exec-announce-controls">
            {(tts.isSpeaking || isSequentialRunning) ? (
              <button className="exec-btn exec-btn-danger" onClick={() => { cancelSeqRef.current = true; tts.cancel(); setIsSequentialRunning(false); setPhase('idle'); setSpotlightIdx(-1); }}>발표 중지</button>
            ) : (
              <button className="exec-btn exec-btn-primary" onClick={handleStartAll}>전체 발표 시작</button>
            )}
          </div>
        </div>
        {VERDICT_ORDER.map((pid, i) => {
          const p = VERDICT_PEOPLE.find(x => x.id === pid)!;
          const fired = VERDICT_FIRED.includes(pid);
          return (
            <div key={pid}
              className={`exec-announce-slot ${spotlightIdx === i ? "selected" : ""}`}
              onClick={() => { if (!tts.isSpeaking) { setSpotlightIdx(i); setPhase('idle'); } }}>
              <span className="exec-announce-order">{i + 1}</span>
              <span className="exec-announce-name">{p.name}</span>
              <span className="exec-announce-dept">{p.title}</span>
              <span className={`exec-announce-verdict-pill exec-announce-${fired ? 'fired' : 'active'}`}>
                {fired ? '해고' : '유지'}
              </span>
              {!tts.isSpeaking && (
                <button className="exec-tts-btn" onClick={e => { e.stopPropagation(); handleSpeak(i); }}>발표</button>
              )}
            </div>
          );
        })}
      </div>

      {/* TTS Settings */}
      <div className="exec-announce-tts">
        <div className="exec-tts-row">
          <label>TTS 엔진</label>
          <div className="exec-filter-btns">
            {(Object.keys(PROVIDER_LABELS) as TTSProvider[]).map(p => (
              <button key={p}
                className={`exec-filter-btn ${tts.settings.provider === p ? "active" : ""}`}
                onClick={() => tts.setSettings(s => ({ ...s, provider: p, voiceId: p === "openai" ? "onyx" : "ko-KR-Neural2-C" }))}>
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="exec-tts-row">
          <label>음성</label>
          {tts.settings.provider === "openai" ? (
            <select className="exec-tts-sel" value={tts.settings.voiceId} onChange={e => tts.setSettings(s => ({ ...s, voiceId: e.target.value }))}>
              <option value="onyx">Onyx (권위적)</option>
              <option value="echo">Echo (부드러운 남성)</option>
              <option value="ash">Ash (따뜻한 남성)</option>
              <option value="sage">Sage (차분한 중성)</option>
              <option value="nova">Nova (밝은 여성)</option>
            </select>
          ) : (
            <select className="exec-tts-sel" value={tts.settings.voiceId} onChange={e => tts.setSettings(s => ({ ...s, voiceId: e.target.value }))}>
              {tts.voices.length > 0 ? tts.voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)
                : <option value="ko-KR-Neural2-C">Neural2 남성 (기본)</option>}
            </select>
          )}
        </div>
        <div className="exec-tts-row">
          <label>음성 필터</label>
          <div className="exec-filter-btns">
            {(Object.keys(FILTER_LABELS) as VoiceFilter[]).map(f => (
              <button key={f}
                className={`exec-filter-btn ${tts.settings.filter === f ? "active" : ""}`}
                onClick={() => tts.setSettings(s => ({ ...s, filter: f }))}>
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="exec-tts-row">
          <label>프로덕션 효과</label>
          <div className="exec-filter-btns">
            {(Object.keys(PRODUCTION_LABELS) as ProductionStyle[]).map(p => (
              <button key={p}
                className={`exec-filter-btn ${tts.settings.production === p ? "active" : ""}`}
                onClick={() => tts.setSettings(s => ({ ...s, production: p }))}>
                {PRODUCTION_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="exec-tts-row">
          <label>속도 {tts.settings.speakingRate}x</label>
          <input type="range" min="0.5" max="1.5" step="0.05" value={tts.settings.speakingRate}
            onChange={e => tts.setSettings(s => ({ ...s, speakingRate: Number(e.target.value) }))} />
        </div>
        <div className="exec-tts-row">
          <label>피치 시프트 {tts.settings.pitchShift}st {tts.settings.provider === "google" ? "(Google: SSML+FFmpeg)" : "(FFmpeg)"}</label>
          <input type="range" min="-12" max="0" step="0.5" value={tts.settings.pitchShift}
            onChange={e => tts.setSettings(s => ({ ...s, pitchShift: Number(e.target.value) }))} />
        </div>
        {tts.settings.provider === "google" && (
          <div className="exec-tts-row">
            <label>SSML 피치 {tts.settings.pitch}st (Google 전용)</label>
            <input type="range" min="-10" max="0" step="0.5" value={tts.settings.pitch}
              onChange={e => tts.setSettings(s => ({ ...s, pitch: Number(e.target.value) }))} />
          </div>
        )}
        <div className="exec-tts-row">
          <label>
            <input type="checkbox" checked={tts.settings.flattenIntonation}
              onChange={e => tts.setSettings(s => ({ ...s, flattenIntonation: e.target.checked }))} />
            {" "}억양 평탄화 (단조롭고 엄숙하게)
          </label>
        </div>
        <div className="exec-tts-row">
          <label>간격 {(tts.settings.pauseBetween / 1000).toFixed(1)}초</label>
          <input type="range" min="1000" max="5000" step="250" value={tts.settings.pauseBetween}
            onChange={e => tts.setSettings(s => ({ ...s, pauseBetween: Number(e.target.value) }))} />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Main Page
   ══════════════════════════════════════ */

export default function ExecutorPage() {
  const [mode, setMode] = useState<AppMode>("debate");
  const [selectedModel, setSelectedModel] = useState("gpt-5.4");
  const [debateComplete, setDebateComplete] = useState(false);
  const [aiEvaluations, setAiEvaluations] = useState<Record<string, { grade: string; evaluation: string; oneliner: string }>>({});
  const tts = useTTS();
  const { evaluations, submitScore } = useEvaluations();
  const { observations, sheetStatus, totalRows, fetchOnce, startAutoSync, stopAutoSync } = useSheetSync();

  const debateCompleted = debateComplete ? 1 : 0;

  const exportAll = useCallback(() => {
    const data = {
      exported_at: new Date().toISOString(),
      game: "할루시네이션: 해고전쟁",
      company: "오빗-컨설팅",
      executor: "김영진 박사 · KISTI 글로벌R&D분석센터",
      evaluations: evaluations.map(ev => ({ name: ev.participant.name, title: ev.participant.title, department: ev.participant.department, overallGrade: ev.overallGrade, status: ev.status, rounds: ev.rounds, announcement: ev.announcement })),
      observations
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `hallucination-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }, [evaluations, observations]);

  const [showHeader, setShowHeader] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setShowHeader(prev => !prev);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <main className="exec-shell">
      <BrandingBar />
      {showHeader && (
        <div className="exec-header-bar">
          <ModeTabBar mode={mode} onChange={setMode} debateCompleted={debateCompleted} evalCount={evaluations.length} ttsActive={tts.isSpeaking} />
          <div className="exec-header-actions">
            <Link className="exec-action-btn" href="/">HOME</Link>
          </div>
        </div>
      )}

      <div className="exec-content">
        {mode === "debate" && <DebateMode selectedModel={selectedModel} setSelectedModel={setSelectedModel} onComplete={setDebateComplete} tts={tts} />}
        {mode === "dashboard" && <DashboardMode evaluations={evaluations} submitScore={submitScore} observations={observations} sheetStatus={sheetStatus} totalRows={totalRows} fetchOnce={fetchOnce} onAiEval={setAiEvaluations} />}
        {mode === "announce" && <AnnounceMode evaluations={evaluations} tts={tts} aiEvaluations={aiEvaluations} />}
      </div>

      <footer className="exec-footer">
        <div className="exec-ticker">
          <span>JTBC 할루시네이션: 해고전쟁</span>
          <span className="exec-ticker-sep">|</span>
          <span>집행관: 김영진 박사 · KISTI</span>
          <span className="exec-ticker-sep">|</span>
          <span>모델: {MODEL_OPTIONS.find(m => m.id === selectedModel)?.label}</span>
          <span className="exec-ticker-sep">|</span>
          <span>토론 {debateCompleted ? "완료" : "대기"}</span>
          <span className="exec-ticker-sep">|</span>
          <span>재직자 {evaluations.filter(e => e.status !== "fired").length}/{evaluations.length}</span>
        </div>
      </footer>
    </main>
  );
}
