import type { DashboardEvent, RuntimeStatus, ViewMode } from "@/lib/types";

export interface EventAdapter {
  kind: "replay" | "socket";
  getWindow(limit: number): DashboardEvent[];
}

export function createReplayAdapter(events: DashboardEvent[]): EventAdapter {
  return {
    kind: "replay",
    getWindow(limit: number) {
      return events.slice(0, Math.max(0, limit));
    }
  };
}

export interface SocketAdapter {
  connect: (handlers: {
    onSnapshot: (events: DashboardEvent[]) => void;
    onEvent: (event: DashboardEvent) => void;
    onStatus: (status: RuntimeStatus) => void;
    onDisconnect: () => void;
    onError: (message: string) => void;
      }) => Promise<{
    disconnect: () => void;
    resolveInterrupt: (action: string) => void;
    readyRound: () => void;
    goRound: () => void;
    startRound: () => void;
    resetRound: () => void;
  }>;
}

export function createSocketAdapter(
  url: string,
  roundId: string,
  viewMode: ViewMode,
  operatorKey?: string
): SocketAdapter {
  return {
    async connect(handlers) {
      const { io } = await import("socket.io-client");
      const socket = io(url, {
        transports: ["websocket"]
      });

      const onSnapshot = (payload: { events?: DashboardEvent[] }) => {
        handlers.onSnapshot(Array.isArray(payload.events) ? payload.events : []);
      };

      const onEvent = (event: DashboardEvent) => {
        handlers.onEvent(event);
      };

      const onStatus = (status: RuntimeStatus) => {
        handlers.onStatus(status);
      };

      const onConnectError = (error: Error) => {
        handlers.onError(error.message);
      };

      const onDisconnect = () => {
        handlers.onDisconnect();
      };

      const onConnect = () => {
        socket.emit("round:subscribe", { roundId, viewMode, operatorKey });
      };

      socket.on("round:snapshot", onSnapshot);
      socket.on("round:event", onEvent);
      socket.on("runtime:status", onStatus);
      socket.on("connect_error", onConnectError);
      socket.on("disconnect", onDisconnect);
      socket.on("connect", onConnect);

      if (socket.connected) {
        onConnect();
      }

      return {
        disconnect() {
          socket.off("round:snapshot", onSnapshot);
          socket.off("round:event", onEvent);
          socket.off("runtime:status", onStatus);
          socket.off("connect_error", onConnectError);
          socket.off("disconnect", onDisconnect);
          socket.off("connect", onConnect);
          socket.disconnect();
        },
        resolveInterrupt(action: string) {
          socket.emit("interrupt:resolve", { roundId, action });
        },
        readyRound() {
          socket.emit("round:ready", { roundId });
        },
        goRound() {
          socket.emit("round:go", { roundId });
        },
        startRound() {
          socket.emit("round:go", { roundId });
        },
        resetRound() {
          socket.emit("round:reset", { roundId });
        }
      };
    }
  };
}
