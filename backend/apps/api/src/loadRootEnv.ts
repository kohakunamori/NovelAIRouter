import { existsSync } from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { apiRootDir } from "./paths.js";

export function loadRootEnv(startDir = process.cwd()) {
  const explicitEnvPath = process.env.API_ENV_FILE?.trim();
  const envPath = explicitEnvPath || findUp(".env", startDir) || findUp(".env", apiRootDir);
  if (envPath) dotenv.config({ path: envPath });
}

function findUp(fileName: string, startDir: string) {
  let current = startDir;

  while (true) {
    const candidate = path.join(current, fileName);
    if (existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
