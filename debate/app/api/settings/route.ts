import { NextResponse } from "next/server";

import {
  getModelSettingsFilePath,
  getProviderKeyStatuses,
  readModelRoutingSettings,
  writeModelRoutingSettings
} from "@/lib/model-routing-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readModelRoutingSettings();

  return NextResponse.json({
    settings,
    providers: getProviderKeyStatuses(),
    filePath: getModelSettingsFilePath()
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = await writeModelRoutingSettings(body?.settings ?? body);

    return NextResponse.json({
      ok: true,
      settings,
      providers: getProviderKeyStatuses(),
      filePath: getModelSettingsFilePath()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "settings_write_failed"
      },
      { status: 400 }
    );
  }
}
