const { createClient } = require("./redis-core.cjs");
const net = require("node:net");
const REDIS_CONNECT_TIMEOUT_MS = Number(
  process.env.REDIS_CONNECT_TIMEOUT_MS ?? 1500
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class MemoryEventStore {
  constructor() {
    this.kind = "memory";
    this.eventsByRound = new Map();
    this.selectedActionByRound = new Map();
    this.runContextByRound = new Map();
  }

  async listEvents(roundId) {
    return clone(this.eventsByRound.get(roundId) ?? []);
  }

  async appendEvent(roundId, event) {
    const current = this.eventsByRound.get(roundId) ?? [];
    current.push(clone(event));
    this.eventsByRound.set(roundId, current);
  }

  async clearRound(roundId) {
    this.eventsByRound.delete(roundId);
    this.selectedActionByRound.delete(roundId);
    this.runContextByRound.delete(roundId);
  }

  async getSelectedAction(roundId) {
    return this.selectedActionByRound.get(roundId) ?? null;
  }

  async setSelectedAction(roundId, action) {
    if (typeof action === "string" && action.length > 0) {
      this.selectedActionByRound.set(roundId, action);
      return;
    }

    this.selectedActionByRound.delete(roundId);
  }

  async getRunContext(roundId) {
    return clone(this.runContextByRound.get(roundId) ?? { runId: null, startedAt: null });
  }

  async setRunContext(roundId, context) {
    const runId = typeof context?.runId === "string" && context.runId.length > 0 ? context.runId : null;
    const startedAt =
      typeof context?.startedAt === "string" && context.startedAt.length > 0
        ? context.startedAt
        : null;

    if (!runId && !startedAt) {
      this.runContextByRound.delete(roundId);
      return;
    }

    this.runContextByRound.set(roundId, { runId, startedAt });
  }

  async close() {}
}

class RedisStreamEventStore {
  constructor(client, streamPrefix) {
    this.kind = "redis-streams";
    this.client = client;
    this.streamPrefix = streamPrefix;
  }

  streamKey(roundId) {
    return `${this.streamPrefix}:round:${roundId}:events`;
  }

  stateKey(roundId) {
    return `${this.streamPrefix}:round:${roundId}:state`;
  }

  async listEvents(roundId) {
    const messages = await this.client.xRange(this.streamKey(roundId), "-", "+");

    return messages
      .map((entry) => {
        const rawEvent = entry.message?.event;
        if (typeof rawEvent !== "string") {
          return null;
        }

        try {
          return JSON.parse(rawEvent);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  async appendEvent(roundId, event) {
    await this.client.xAdd(this.streamKey(roundId), "*", {
      event: JSON.stringify(event),
      event_id: String(event.event_id),
      seq: String(event.seq),
      type: String(event.type)
    });
  }

  async clearRound(roundId) {
    await this.client.del(this.streamKey(roundId), this.stateKey(roundId));
  }

  async getSelectedAction(roundId) {
    const selectedAction = await this.client.hGet(
      this.stateKey(roundId),
      "selected_action"
    );

    return typeof selectedAction === "string" && selectedAction.length > 0
      ? selectedAction
      : null;
  }

  async setSelectedAction(roundId, action) {
    if (typeof action !== "string" || action.length === 0) {
      await this.client.hDel(this.stateKey(roundId), "selected_action");
      return;
    }

    await this.client.hSet(this.stateKey(roundId), {
      selected_action: action
    });
  }

  async getRunContext(roundId) {
    const [activeRunId, startedAt] = await this.client.hmGet(this.stateKey(roundId), [
      "active_run_id",
      "started_at"
    ]);

    return {
      runId:
        typeof activeRunId === "string" && activeRunId.length > 0
          ? activeRunId
          : null,
      startedAt:
        typeof startedAt === "string" && startedAt.length > 0
          ? startedAt
          : null
    };
  }

  async setRunContext(roundId, context) {
    const stateKey = this.stateKey(roundId);
    const runId = typeof context?.runId === "string" && context.runId.length > 0 ? context.runId : null;
    const startedAt =
      typeof context?.startedAt === "string" && context.startedAt.length > 0
        ? context.startedAt
        : null;

    if (!runId && !startedAt) {
      await this.client.hDel(stateKey, "active_run_id");
      await this.client.hDel(stateKey, "started_at");
      return;
    }

    await this.client.hSet(stateKey, {
      active_run_id: runId ?? "",
      started_at: startedAt ?? ""
    });
  }

  async close() {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }
}

function parseRedisEndpoint(redisUrl) {
  const target = new URL(redisUrl);
  return {
    host: target.hostname || "127.0.0.1",
    port: Number(target.port || 6379)
  };
}

async function probeRedisEndpoint(redisUrl) {
  const endpoint = parseRedisEndpoint(redisUrl);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    const timerId = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `Redis TCP probe timed out after ${REDIS_CONNECT_TIMEOUT_MS}ms`
        )
      );
    }, REDIS_CONNECT_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timerId);
      socket.destroy();
      resolve();
    });

    socket.once("error", (error) => {
      clearTimeout(timerId);
      socket.destroy();
      reject(error);
    });
  });
}

async function createEventStore({ redisUrl, streamPrefix }) {
  if (!redisUrl) {
    return new MemoryEventStore();
  }

  try {
    await probeRedisEndpoint(redisUrl);

    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: false
      }
    });
    client.on("error", (error) => {
      console.error("[redis-stream-store]", error.message);
    });

    await client.connect();
    return new RedisStreamEventStore(client, streamPrefix);
  } catch (error) {
    console.warn(
      `[socket-runtime] Redis unavailable, falling back to memory store: ${error.message}`
    );
    return new MemoryEventStore();
  }
}

module.exports = {
  createEventStore
};
