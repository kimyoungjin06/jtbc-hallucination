import type { ChannelSnapshot } from "@/lib/types";

interface DependencyGraphProps {
  channels: ChannelSnapshot[];
}

const POSITIONS: Record<string, { x: number; y: number }> = {
  "moderator-room": { x: 180, y: 44 },
  existentialist: { x: 55, y: 128 },
  utilitarian: { x: 305, y: 128 },
  "virtue-ethics": { x: 55, y: 228 },
  skeptic: { x: 180, y: 186 },
  pragmatist: { x: 305, y: 228 },
  "public-briefing": { x: 180, y: 314 }
};

export function DependencyGraph({ channels }: DependencyGraphProps) {
  const active = new Map(channels.map((channel) => [channel.id, channel]));

  return (
    <div className="graph-shell">
      <svg viewBox="0 0 360 340" role="img" aria-label="Agent dependency graph">
        <title>Agent dependency graph</title>
        {channels
          .filter((channel) => channel.id !== "moderator-room")
          .map((channel) => {
            const source = POSITIONS[channel.id];
            const target =
              channel.id === "public-briefing"
                ? POSITIONS["moderator-room"]
                : POSITIONS["moderator-room"];

            return (
              <line
                key={`line-${channel.id}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className="graph-line"
              />
            );
          })}
        {channels.map((channel) => {
          const point = POSITIONS[channel.id];
          const isHot = channel.lastSeq > 0;
          const isInterrupted = channel.interruptPending;

          return (
            <g key={channel.id} transform={`translate(${point.x}, ${point.y})`}>
              <circle
                r={channel.id === "moderator-room" ? 34 : 26}
                className="graph-node"
                style={{ ["--node-hue" as string]: channel.hue }}
                data-hot={isHot}
                data-interrupt={isInterrupted}
              />
              <text className="graph-label" textAnchor="middle" y="4">
                {active.get(channel.id)?.label.replace("#", "")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
