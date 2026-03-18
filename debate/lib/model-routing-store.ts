import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  applyTimestamp,
  DEFAULT_MODEL_ROUTING,
  mergeModelRouting,
  PROVIDER_OPTIONS,
  type ModelRoutingSettings,
  type ProviderKeyStatus
} from "@/lib/model-routing";

const SETTINGS_DIR = path.join(process.cwd(), "config");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "agent-models.json");

async function ensureSettingsDir() {
  await mkdir(SETTINGS_DIR, { recursive: true });
}

export async function readModelRoutingSettings(): Promise<ModelRoutingSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    return mergeModelRouting(JSON.parse(raw));
  } catch {
    return DEFAULT_MODEL_ROUTING;
  }
}

export async function writeModelRoutingSettings(
  input: unknown
): Promise<ModelRoutingSettings> {
  await ensureSettingsDir();
  const settings = applyTimestamp(mergeModelRouting(input));
  await writeFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
}

export function getProviderKeyStatuses(): ProviderKeyStatus[] {
  return PROVIDER_OPTIONS.map((provider) => ({
    ...provider,
    configured:
      typeof process.env[provider.envVar] === "string" &&
      process.env[provider.envVar]!.trim().length > 0
  }));
}

export function getModelSettingsFilePath() {
  return SETTINGS_FILE;
}
