import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

/** Google Cloud TTS 한국어 음성 목록 */
const KOREAN_VOICES = [
  { id: "ko-KR-Neural2-C", label: "Neural2 남성 (권위)", gender: "MALE", type: "Neural2" },
  { id: "ko-KR-Neural2-A", label: "Neural2 여성 (단호)", gender: "FEMALE", type: "Neural2" },
  { id: "ko-KR-Wavenet-C", label: "WaveNet 남성 C", gender: "MALE", type: "WaveNet" },
  { id: "ko-KR-Wavenet-D", label: "WaveNet 남성 D", gender: "MALE", type: "WaveNet" },
  { id: "ko-KR-Wavenet-A", label: "WaveNet 여성 A", gender: "FEMALE", type: "WaveNet" },
  { id: "ko-KR-Wavenet-B", label: "WaveNet 여성 B", gender: "FEMALE", type: "WaveNet" },
  { id: "ko-KR-Standard-C", label: "Standard 남성 C", gender: "MALE", type: "Standard" },
  { id: "ko-KR-Standard-D", label: "Standard 남성 D", gender: "MALE", type: "Standard" },
  { id: "ko-KR-Standard-A", label: "Standard 여성 A", gender: "FEMALE", type: "Standard" },
  { id: "ko-KR-Standard-B", label: "Standard 여성 B", gender: "FEMALE", type: "Standard" },
] as const;

/* ── FFmpeg 경로 (lazy resolve) ── */

function getFFmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("ffmpeg-static") as string;
  } catch {
    return null;
  }
}

/* ── SSML 생성 ── */

type VoiceFilter = "none" | "broadcast" | "courtroom" | "doom" | "executor";

function buildSSML(text: string, filter: VoiceFilter): string {
  if (filter === "none") return text;

  // 문장 분리 (마침표, 물음표, 느낌표 기준)
  const sentences = text.split(/(?<=[.?!。])\s*/).filter(s => s.trim());

  const pitchMap: Record<VoiceFilter, string> = { none: "+0st", broadcast: "-1st", courtroom: "-2st", doom: "-3st", executor: "-1.5st" };
  const rateMap: Record<VoiceFilter, string> = { none: "100%", broadcast: "92%", courtroom: "85%", doom: "78%", executor: "82%" };
  const breakMs: Record<VoiceFilter, number> = { none: 0, broadcast: 300, courtroom: 600, doom: 900, executor: 700 };
  const emphasis: Record<VoiceFilter, string> = { none: "none", broadcast: "moderate", courtroom: "strong", doom: "strong", executor: "strong" };

  let ssml = `<speak><prosody rate="${rateMap[filter]}" pitch="${pitchMap[filter]}" volume="loud">`;
  for (let i = 0; i < sentences.length; i++) {
    ssml += `<s><emphasis level="${emphasis[filter]}">${escapeXml(sentences[i])}</emphasis></s>`;
    if (i < sentences.length - 1) {
      ssml += `<break time="${breakMs[filter]}ms"/>`;
    }
  }
  ssml += `</prosody></speak>`;
  return ssml;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── FFmpeg 후처리 ── */

const FFMPEG_FILTERS: Record<VoiceFilter, string> = {
  none: "",
  broadcast: [
    "highpass=f=80",
    "bass=g=4:f=200",
    "equalizer=f=3000:t=q:w=1.2:g=2",
    "acompressor=threshold=0.1:ratio=4:attack=5:release=100:makeup=2",
    "loudnorm=I=-16:TP=-1.5:LRA=7",
  ].join(","),
  courtroom: [
    "highpass=f=60",
    "bass=g=7:f=180",
    "equalizer=f=800:t=q:w=1:g=-2",
    "equalizer=f=2500:t=q:w=1.5:g=3",
    "treble=g=-3:f=6000",
    "acompressor=threshold=0.08:ratio=6:attack=3:release=80:makeup=3",
    "aecho=0.8:0.88:40:0.25",
    "loudnorm=I=-14:TP=-1:LRA=5",
  ].join(","),
  doom: [
    "highpass=f=50",
    "bass=g=10:f=150",
    "equalizer=f=600:t=q:w=0.8:g=-3",
    "equalizer=f=2000:t=q:w=1.5:g=4",
    "treble=g=-5:f=5000",
    "acompressor=threshold=0.06:ratio=10:attack=2:release=60:makeup=4",
    "aecho=0.8:0.85:60:0.35",
    "aecho=0.8:0.7:25:0.15",
    "loudnorm=I=-12:TP=-0.5:LRA=4",
    "atempo=0.95",
  ].join(","),
  executor: [
    "highpass=f=60",
    "bass=g=8:f=120",                    // 흉성 깊이
    "equalizer=f=250:t=q:w=0.8:g=-2",   // 울림 제거
    "equalizer=f=2500:t=q:w=1.2:g=3",   // 발음 명료도
    "treble=g=-4:f=6000",               // 부드러운 고역
    "acompressor=threshold=0.08:ratio=6:attack=3:release=80:makeup=3", // 일관된 힘
    "aecho=0.6:0.4:80|120:0.15|0.08",   // 대강당 공간감
    "loudnorm=I=-14:TP=-1:LRA=5",
  ].join(","),
};

async function processWithFFmpeg(inputBuffer: Buffer, filter: VoiceFilter, pitchShift = 0, flattenIntonation = false): Promise<Buffer> {
  const ffmpegBin = getFFmpegPath();
  if (!ffmpegBin) return inputBuffer;

  let filterChain = FFMPEG_FILTERS[filter] || "";

  // 추가 피치 시프트 (semitones → rate factor)
  if (pitchShift !== 0) {
    const factor = Math.pow(2, pitchShift / 12);
    const rateFilter = `asetrate=44100*${factor.toFixed(4)},aresample=44100`;
    filterChain = filterChain ? `${rateFilter},${filterChain}` : rateFilter;
  }

  // 억양 평탄화 (다이나믹 레인지 강력 압축)
  if (flattenIntonation) {
    filterChain += (filterChain ? "," : "") + "acompressor=threshold=0.05:ratio=12:attack=1:release=50:makeup=3";
  }

  if (!filterChain) return inputBuffer;

  // dynamic import to avoid bundling issues
  const { spawn } = await import("child_process");

  return new Promise((resolve) => {
    const args = [
      "-i", "pipe:0",
      "-af", filterChain,
      "-f", "mp3",
      "-b:a", "192k",
      "pipe:1",
    ];

    const proc = spawn(ffmpegBin, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        console.error("[FFmpeg stderr]", stderr);
        resolve(inputBuffer);
      }
    });

    proc.on("error", () => {
      resolve(inputBuffer);
    });

    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}

/* ── 프로덕션 패키지: SFX 합성 + 음성 믹싱 ── */

type ProductionStyle = "none" | "sting" | "courtdrama" | "doomsday";

const PRODUCTION_LABELS: Record<ProductionStyle, string> = {
  none: "프로덕션 없음",
  sting: "드라마틱 스팅",
  courtdrama: "법정 드라마",
  doomsday: "최후심판",
};

/**
 * FFmpeg로 SFX를 합성하고 음성과 조합하여 "프로덕션 패키지"를 만든다.
 * 외부 파일 없이 FFmpeg 내장 오디오 제너레이터만 사용.
 *
 * 타임라인 (courtdrama 기준):
 *  [0-1.8s]  텐션 라이저 (상승 사인파 스윕)
 *  [1.8-2.1s] 임팩트 (저음 폭발)
 *  [2.1-2.9s] 침묵 (800ms — 긴장 유지)
 *  [2.9s-end] 음성 (+ 서브베이스 드론 깔림)
 *  [end+0.3s] 클로징 임팩트
 */
async function assembleProduction(
  voiceBuffer: Buffer,
  style: ProductionStyle
): Promise<Buffer> {
  if (style === "none") return voiceBuffer;

  const ffmpegBin = getFFmpegPath();
  if (!ffmpegBin) return voiceBuffer;

  const { spawn } = await import("child_process");
  const { writeFileSync, unlinkSync, rmdirSync, mkdtempSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");

  // 음성을 임시 파일로 저장 (filter_complex에서 pipe:0 하나 이상 사용 불가)
  const tmp = mkdtempSync(join(tmpdir(), "tts-"));
  const voicePath = join(tmp, "voice.mp3");
  writeFileSync(voicePath, voiceBuffer);

  const cfg = {
    sting: {
      riserDur: 1.2, riserStart: 200, riserEnd: 800, riserVol: 0.12,
      impactFreq: 55, impactDur: 0.5, impactVol: 0.4,
      silenceDur: 0.5,
      droneFreq: 45, droneVol: 0.06,
      closingFreq: 50, closingDur: 0.4, closingVol: 0.25,
    },
    courtdrama: {
      riserDur: 1.8, riserStart: 120, riserEnd: 600, riserVol: 0.15,
      impactFreq: 40, impactDur: 0.7, impactVol: 0.5,
      silenceDur: 0.8,
      droneFreq: 38, droneVol: 0.08,
      closingFreq: 42, closingDur: 0.6, closingVol: 0.35,
    },
    doomsday: {
      riserDur: 2.5, riserStart: 80, riserEnd: 500, riserVol: 0.2,
      impactFreq: 30, impactDur: 1.0, impactVol: 0.6,
      silenceDur: 1.2,
      droneFreq: 28, droneVol: 0.12,
      closingFreq: 32, closingDur: 0.8, closingVol: 0.45,
    },
  }[style];

  if (!cfg) return voiceBuffer;

  const introTotal = cfg.riserDur + cfg.impactDur + cfg.silenceDur;

  // filter_complex:
  //  [riser]  = 상승 사인파 스윕 + exponential decay
  //  [impact] = 저주파 사인 + noise burst + fast decay
  //  [silence] = 무음
  //  [intro] = riser + impact + silence concat
  //  [drone] = 서브베이스 사인 드론 (음성 길이만큼)
  //  [voice] = 입력 음성
  //  [closing] = 마무리 임팩트
  //  최종 = intro concat voice amix drone, 그 뒤 closing

  const filterComplex = [
    // 라이저: 주파수 스윕 사인파
    `aevalsrc='sin(2*PI*(${cfg.riserStart}+(${cfg.riserEnd}-${cfg.riserStart})*(t/${cfg.riserDur}))*t)*exp(-0.3*(${cfg.riserDur}-t))':s=44100:d=${cfg.riserDur},volume=${cfg.riserVol}[riser]`,
    // 임팩트: 저주파 사인 + 빠른 감쇄
    `aevalsrc='sin(2*PI*${cfg.impactFreq}*t)*exp(-4*t)+0.3*(random(0)-0.5)*exp(-8*t)':s=44100:d=${cfg.impactDur},volume=${cfg.impactVol}[impact]`,
    // 침묵
    `anullsrc=r=44100:cl=mono,atrim=0:${cfg.silenceDur}[silence]`,
    // 인트로 = riser → impact → silence
    `[riser][impact][silence]concat=n=3:v=0:a=1[intro]`,
    // 서브베이스 드론 (음성보다 좀 더 길게)
    `aevalsrc='sin(2*PI*${cfg.droneFreq}*t)*0.5+sin(2*PI*${cfg.droneFreq * 1.5}*t)*0.2':s=44100:d=120,volume=${cfg.droneVol}[drone_raw]`,
    // 음성 읽기
    `[0:a]aformat=sample_rates=44100:channel_layouts=mono[voice]`,
    // 음성 + 드론 믹스 (음성 길이 기준)
    `[voice][drone_raw]amix=inputs=2:duration=first:normalize=0[voiced]`,
    // 클로징 임팩트
    `aevalsrc='sin(2*PI*${cfg.closingFreq}*t)*exp(-3*t)+0.2*(random(0)-0.5)*exp(-6*t)':s=44100:d=${cfg.closingDur},volume=${cfg.closingVol}[closing]`,
    // 인트로 + 음성(드론 믹스) + 클로징
    `[intro][voiced][closing]concat=n=3:v=0:a=1[final]`,
    // 최종 리미터
    `[final]alimiter=limit=0.95,loudnorm=I=-14:TP=-1:LRA=7[out]`,
  ].join(";");

  return new Promise((resolve) => {
    const args = [
      "-i", voicePath,
      "-filter_complex", filterComplex,
      "-map", "[out]",
      "-f", "mp3",
      "-b:a", "192k",
      "pipe:1",
    ];

    const proc = spawn(ffmpegBin, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      // 정리
      try { unlinkSync(voicePath); } catch {}
      try { rmdirSync(tmp); } catch {}

      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        console.error("[FFmpeg production stderr]", stderr.slice(-500));
        resolve(voiceBuffer);
      }
    });

    proc.on("error", () => {
      try { unlinkSync(voicePath); } catch {}
      resolve(voiceBuffer);
    });

    proc.stdin.end();
  });
}

/* ── Request ── */

type TTSProvider = "google" | "openai";

const OPENAI_VOICES = [
  { id: "onyx", label: "Onyx (권위적, 깊은 목소리)" },
  { id: "echo", label: "Echo (부드러운 남성)" },
  { id: "ash", label: "Ash (따뜻한 남성)" },
  { id: "sage", label: "Sage (차분한 중성)" },
  { id: "nova", label: "Nova (밝은 여성)" },
  { id: "coral", label: "Coral (따뜻한 여성)" },
] as const;

interface TTSRequest {
  text: string;
  provider?: TTSProvider;
  voiceId?: string;
  speakingRate?: number;
  pitch?: number;
  pitchShift?: number;         // FFmpeg 피치 시프트 (semitones, -6 ~ 0)
  flattenIntonation?: boolean; // 억양 평탄화
  filter?: VoiceFilter;
  production?: ProductionStyle;
  instructions?: string;
}

/* ── POST: TTS 합성 ── */

export async function POST(request: Request) {
  try {
    const body: TTSRequest = await request.json();
    const {
      text,
      provider = "google",
      voiceId,
      speakingRate = 0.78,
      pitch = -4.0,
      pitchShift = 0,
      flattenIntonation = false,
      filter = "executor",
      production = "none",
      instructions,
    } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    let rawBuffer: Buffer;

    if (provider === "openai") {
      /* ── OpenAI gpt-4o-mini-tts ── */
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

      const openai = new OpenAI({ apiKey: openaiKey });
      let defaultInstructions = "엄중하고 근엄한 톤으로, 법원 판사가 판결을 내리듯이 천천히 또박또박 말하세요. 감정을 절제하되 무게감 있게.";
      if (flattenIntonation) {
        defaultInstructions += " 억양의 변화를 최소화하고, 매우 단조롭고 평탄하게 읽으세요. 감정 기복 없이 일정한 톤을 유지하세요.";
      }

      const mp3 = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: (voiceId as "onyx" | "echo" | "ash" | "sage" | "nova" | "coral") || "onyx",
        input: text,
        instructions: instructions || defaultInstructions,
        speed: speakingRate > 0 ? speakingRate : 0.85,
        response_format: "mp3",
      });

      rawBuffer = Buffer.from(await mp3.arrayBuffer());
    } else {
      /* ── Google Cloud TTS ── */
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "GOOGLE_API_KEY not configured" }, { status: 500 });

      const googleVoice = voiceId || "ko-KR-Neural2-C";
      const useSSML = filter !== "none";
      const ssml = useSSML ? buildSSML(text, filter) : undefined;

      const googleRes = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: useSSML ? { ssml } : { text },
            voice: { languageCode: "ko-KR", name: googleVoice },
            audioConfig: {
              audioEncoding: "MP3",
              speakingRate: useSSML ? 1.0 : speakingRate,
              pitch: useSSML ? 0 : pitch,
              volumeGainDb: 0,
              effectsProfileId: ["large-home-entertainment-class-device", "large-automotive-class-device"],
            },
          }),
        }
      );

      if (!googleRes.ok) {
        const err = await googleRes.text();
        return NextResponse.json({ error: `Google TTS error: ${googleRes.status}`, details: err }, { status: 502 });
      }

      const data = await googleRes.json();
      rawBuffer = Buffer.from(data.audioContent, "base64");
    }

    // FFmpeg 후처리 (Google/OpenAI 공통 — 피치 시프트 + 억양 평탄화 + 필터)
    const filteredBuffer = await processWithFFmpeg(rawBuffer, filter, pitchShift, flattenIntonation);

    // 프로덕션 패키지 (SFX 합성)
    const audioBuffer = await assembleProduction(filteredBuffer, production);

    const responseBody = new Uint8Array(audioBuffer);
    return new NextResponse(responseBody, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(responseBody.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET: 음성 목록 & 필터 목록 반환 */
export async function GET() {
  return NextResponse.json({
    providers: [
      { id: "google", label: "Google TTS" },
      { id: "openai", label: "OpenAI TTS (엄중한 톤)" },
    ],
    voices: {
      google: KOREAN_VOICES,
      openai: OPENAI_VOICES,
    },
    filters: ["none", "broadcast", "courtroom", "doom", "executor"],
    productions: Object.entries(PRODUCTION_LABELS).map(([id, label]) => ({ id, label })),
    ffmpegAvailable: !!getFFmpegPath(),
  });
}
