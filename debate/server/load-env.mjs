import { existsSync } from "node:fs";
import path from "node:path";

import { config as loadEnvFile } from "dotenv";

const ENV_FILES = [".env", ".env.local"];

for (const fileName of ENV_FILES) {
  const filePath = path.join(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    continue;
  }

  loadEnvFile({
    path: filePath,
    override: fileName === ".env.local"
  });
}
