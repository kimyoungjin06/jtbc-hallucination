import "../server/load-env.mjs";

import process from "node:process";

import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4010";
const ROUND_ID = process.env.PILOT_ROUND_ID ?? "case01-r1";
const OPERATOR_KEY = process.env.OPERATOR_KEY ?? process.env.NEXT_PUBLIC_OPERATOR_KEY ?? "";
const ACTION = process.argv[2] ?? process.env.PILOT_ACTION ?? "mitigate";
const TIMEOUT_MS = Number(process.env.PILOT_TIMEOUT_MS ?? 90000);
const AUTO_RESET = process.env.PILOT_AUTO_RESET !== "0";

const socket = io(SOCKET_URL, {
  transports: ["websocket"]
});

const state = {
  events: [],
  resetRequested: false,
  resetAcknowledged: !AUTO_RESET,
  resolved: false,
  snapshotCount: 0,
  started: false,
  finalDecision: null,
  publicSummary: null,
  operatorSummary: null
};

function absorbDecisionEvent(event) {
  if (event?.type !== "final_decision") {
    return;
  }

  state.finalDecision = event.payload?.decision ?? state.finalDecision;

  if (typeof event.payload?.public_summary === "string") {
    state.publicSummary = event.payload.public_summary;
  }

  if (typeof event.payload?.operator_summary === "string") {
    state.operatorSummary = event.payload.operator_summary;
  }
}

function finishSuccessfully() {
  clearTimeout(timeoutId);
  console.log("[pilot-case01] complete");
  console.log(
    JSON.stringify(
      {
        roundId: ROUND_ID,
        action: ACTION,
        finalDecision: state.finalDecision,
        operatorSummary: state.operatorSummary,
        publicSummary: state.publicSummary,
        eventCount: state.events.length
      },
      null,
      2
    )
  );
  socket.disconnect();
  process.exit(0);
}

const timeoutId = setTimeout(() => {
  console.error(`[pilot-case01] timed out after ${TIMEOUT_MS}ms`);
  socket.disconnect();
  process.exit(1);
}, TIMEOUT_MS);

socket.on("connect", () => {
  console.log(`[pilot-case01] connected to ${SOCKET_URL}`);
  socket.emit("round:subscribe", {
    roundId: ROUND_ID,
    viewMode: "operator",
    operatorKey: OPERATOR_KEY
  });
});

socket.on("round:snapshot", (payload) => {
  state.snapshotCount += 1;
  state.events = Array.isArray(payload?.events) ? payload.events : [];
  state.events.forEach(absorbDecisionEvent);
  console.log(`[pilot-case01] snapshot loaded (${state.events.length} events)`);

  if (AUTO_RESET && !state.resetRequested) {
    state.resetRequested = true;
    console.log("[pilot-case01] resetting round to start from seq=1");
    socket.emit("round:reset", {
      roundId: ROUND_ID
    });
    return;
  }

  if (AUTO_RESET && state.resetRequested && !state.resetAcknowledged && state.snapshotCount >= 2) {
    state.resetAcknowledged = true;
    console.log("[pilot-case01] reset acknowledged");
  }
});

socket.on("round:event", (event) => {
  state.events.push(event);
  absorbDecisionEvent(event);
  console.log(
    `[pilot-case01] event seq=${event.seq} type=${event.type} channel=${event.channel_id}`
  );
});

socket.on("runtime:status", (status) => {
  console.log(
    `[pilot-case01] status state=${status.state} cursor=${status.cursor}/${status.total}`
  );

  if (status.state === "idle" && !state.started && state.resetAcknowledged) {
    state.started = true;
    console.log("[pilot-case01] starting round");
    socket.emit("round:start", {
      roundId: ROUND_ID
    });
  }

  if (status.state === "waiting_for_interrupt" && !state.resolved) {
    state.resolved = true;
    console.log(`[pilot-case01] resolving interrupt with action=${ACTION}`);
    socket.emit("interrupt:resolve", {
      roundId: ROUND_ID,
      action: ACTION
    });
  }

  if (status.state === "complete" && state.finalDecision) {
    finishSuccessfully();
  }
});

socket.on("runtime:error", (payload) => {
  clearTimeout(timeoutId);
  console.error("[pilot-case01] runtime error", payload?.message ?? payload);
  socket.disconnect();
  process.exit(1);
});

socket.on("connect_error", (error) => {
  clearTimeout(timeoutId);
  console.error(`[pilot-case01] connect error: ${error.message}`);
  socket.disconnect();
  process.exit(1);
});
