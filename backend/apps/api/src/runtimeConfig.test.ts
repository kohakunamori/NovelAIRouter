import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiRootDir = fileURLToPath(new URL("..", import.meta.url));
const cleanupPaths = new Set<string>();

function trackCleanup(pathToRemove: string) {
  cleanupPaths.add(pathToRemove);
}

function stubRequiredEnv(storageRoot: string) {
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/test");
  vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
  vi.stubEnv("STORAGE_ROOT", storageRoot);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const pathToRemove of cleanupPaths) {
    rmSync(pathToRemove, { recursive: true, force: true });
  }
  cleanupPaths.clear();
});

describe("runtime config storage migration", () => {
  it("copies legacy dist system files before creating a new credential key", async () => {
    const baseDirectory = `.tmp-runtime-config-${process.pid}-${Date.now()}`;
    const storageRoot = `${baseDirectory}/storage`;
    const legacySystemDirectory = path.resolve(apiRootDir, "dist", storageRoot, "system");
    const canonicalSystemDirectory = path.resolve(apiRootDir, storageRoot, "system");
    const credentialKeyPath = path.join(canonicalSystemDirectory, "novelai-credential-encryption-key.base64");
    const credentialKeyValue = Buffer.alloc(32, 7).toString("base64");

    trackCleanup(path.resolve(apiRootDir, baseDirectory));
    trackCleanup(path.resolve(apiRootDir, "dist", baseDirectory));
    mkdirSync(legacySystemDirectory, { recursive: true });
    writeFileSync(path.join(legacySystemDirectory, "novelai-credential-encryption-key.base64"), `${credentialKeyValue}\n`, "utf8");

    vi.resetModules();
    stubRequiredEnv(storageRoot);
    const { getCredentialEncryptionKey, getRuntimeConfigPaths } = await import("./runtimeConfig.js");

    expect(getCredentialEncryptionKey()).toEqual(Buffer.alloc(32, 7));
    expect(readFileSync(credentialKeyPath, "utf8").trim()).toBe(credentialKeyValue);
    expect(getRuntimeConfigPaths().credentialEncryptionKeyPath).toBe(credentialKeyPath);
  });
});
