import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/executor/debate-replay?type=pro|con
 * 확정된 토론 결과를 반환합니다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "pro";

  const filename = type === "con" ? "debate-best-con.json" : "debate-best-pro.json";

  try {
    const dataPath = join(process.cwd(), "data", filename);
    const raw = readFileSync(dataPath, "utf-8");
    const data = JSON.parse(raw);

    // final-statements도 함께
    const fsPath = join(process.cwd(), "data", "final-statements.json");
    const fs = JSON.parse(readFileSync(fsPath, "utf-8"));

    return NextResponse.json({
      debate: data,
      finalStatement: type === "con" ? fs.con : fs.pro,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to load ${filename}` },
      { status: 500 }
    );
  }
}
