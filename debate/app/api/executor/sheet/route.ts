import { NextResponse } from "next/server";

import {
  buildSheetURL,
  parseObservationRows,
  summarizeObservations,
  formatObservationsForAI
} from "@/lib/google-sheet";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    return NextResponse.json(
      { error: "GOOGLE_SHEET_ID not configured", observations: [] },
      { status: 200 }
    );
  }

  try {
    const gid = process.env.GOOGLE_SHEET_GID ?? "0";
    const url = buildSheetURL(sheetId, gid);
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      throw new Error(`Sheet fetch failed: ${res.status} ${res.statusText}`);
    }
    const csv = await res.text();
    const rows = parseObservationRows(csv);
    const observations = summarizeObservations(rows);

    // ?format=ai-prompt&scene=R1 로 호출하면 AI 채점용 텍스트 반환
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const sceneFilter = searchParams.get("scene") ?? undefined;

    if (format === "ai-prompt") {
      const prompt = formatObservationsForAI(observations, sceneFilter);
      return new NextResponse(prompt, {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      rowCount: rows.length,
      observations
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, observations: [] },
      { status: 502 }
    );
  }
}
