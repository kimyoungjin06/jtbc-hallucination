import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Team Agent Visualizer",
  description: "6-channel arcade ops visualizer for multi-agent rounds"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
