import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { badRequest } from "./errors.js";
import { legacyBuildOutputStorageRoots, storageRoot } from "./storage/index.js";

const runtimeConfigPath = path.join(storageRoot, "system", "config.json");
const credentialEncryptionKeyPath = path.join(storageRoot, "system", "novelai-credential-encryption-key.base64");
const sessionSecretPath = path.join(storageRoot, "system", "session-secret.base64");

const defaultGalleryOrderUpdatedAt = "1970-01-01T00:00:00.000Z";

const persistedRuntimeConfigValuesSchema = z.object({
  generationConcurrency: z.number().int().positive(),
  resultConsumerTimeoutMs: z.number().int().positive(),
  assetUploadMaxBytes: z.number().int().positive(),
  novelAiCredentialKeyVersion: z.number().int().positive(),
  novelAiAccountLeaseTtlMs: z.number().int().positive(),
  novelAiAccountLeaseHeartbeatMs: z.number().int().positive(),
  novelAiAccountAcquireTimeoutMs: z.number().int().positive(),
  novelAiAccountCooldownMs: z.number().int().positive(),
  novelAiHttpTimeoutMs: z.number().int().positive(),
  novelAiTestTimeoutMs: z.number().int().positive(),
  novelAiProxyUrl: z.string().url().nullable(),
  novelAiHealthCheckUrl: z.string().url().nullable(),
  novelAiAdminHealthChecksEnabled: z.boolean(),
  novelAiSmokeTestsEnabled: z.boolean(),
  galleryOrderSeed: z.string().min(1).default("default"),
  galleryOrderUpdatedAt: z.string().datetime().default(defaultGalleryOrderUpdatedAt),
});

const persistedRuntimeConfigDocumentSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  values: persistedRuntimeConfigValuesSchema,
});

const runtimeConfigPatchSchema = z.object({
  generationConcurrency: z.coerce.number().int().positive().optional(),
  resultConsumerTimeoutMs: z.coerce.number().int().positive().optional(),
  assetUploadMaxBytes: z.coerce.number().int().positive().optional(),
  novelAiCredentialKeyVersion: z.coerce.number().int().positive().optional(),
  novelAiAccountLeaseTtlMs: z.coerce.number().int().positive().optional(),
  novelAiAccountLeaseHeartbeatMs: z.coerce.number().int().positive().optional(),
  novelAiAccountAcquireTimeoutMs: z.coerce.number().int().positive().optional(),
  novelAiAccountCooldownMs: z.coerce.number().int().positive().optional(),
  novelAiHttpTimeoutMs: z.coerce.number().int().positive().optional(),
  novelAiTestTimeoutMs: z.coerce.number().int().positive().optional(),
  novelAiProxyUrl: z.preprocess((value) => (value === "" ? null : value), z.string().url().nullable()).optional(),
  novelAiHealthCheckUrl: z.preprocess((value) => (value === "" ? null : value), z.string().url().nullable()).optional(),
  novelAiAdminHealthChecksEnabled: z.boolean().optional(),
  novelAiSmokeTestsEnabled: z.boolean().optional(),
});

export type PersistedRuntimeConfigValues = z.infer<typeof persistedRuntimeConfigValuesSchema>;
export type PersistedRuntimeConfigDocument = z.infer<typeof persistedRuntimeConfigDocumentSchema>;
export type RuntimeConfigPatch = z.infer<typeof runtimeConfigPatchSchema>;

let cachedRuntimeConfig: PersistedRuntimeConfigDocument | null = null;
let cachedCredentialEncryptionKey: Buffer | null = null;
let cachedSessionSecret: string | null = null;
let legacyRuntimeSystemFilesMigrated = false;

function ensureLegacyRuntimeSystemFilesMigrated() {
  if (legacyRuntimeSystemFilesMigrated) {
    return;
  }
  legacyRuntimeSystemFilesMigrated = true;

  const targetSystemDirectory = path.dirname(runtimeConfigPath);
  for (const legacyStorageRoot of legacyBuildOutputStorageRoots) {
    const legacySystemDirectory = path.join(legacyStorageRoot, "system");
    if (path.resolve(legacySystemDirectory) === path.resolve(targetSystemDirectory) || !existsSync(legacySystemDirectory)) {
      continue;
    }

    const entries = readdirSync(legacySystemDirectory, { withFileTypes: true });
    const missingFiles = entries.filter((entry) => entry.isFile() && !existsSync(path.join(targetSystemDirectory, entry.name)));
    if (missingFiles.length === 0) {
      continue;
    }

    mkdirSync(targetSystemDirectory, { recursive: true });
    for (const entry of missingFiles) {
      copyFileSync(path.join(legacySystemDirectory, entry.name), path.join(targetSystemDirectory, entry.name));
    }
  }
}

function buildDefaultRuntimeConfigValues(): PersistedRuntimeConfigValues {
  return {
    generationConcurrency: 1,
    resultConsumerTimeoutMs: 30_000,
    assetUploadMaxBytes: 15 * 1024 * 1024,
    novelAiCredentialKeyVersion: 1,
    novelAiAccountLeaseTtlMs: 120_000,
    novelAiAccountLeaseHeartbeatMs: 30_000,
    novelAiAccountAcquireTimeoutMs: 10_000,
    novelAiAccountCooldownMs: 300_000,
    novelAiHttpTimeoutMs: 120_000,
    novelAiTestTimeoutMs: 10_000,
    novelAiProxyUrl: null,
    novelAiHealthCheckUrl: "https://api.novelai.net/user/data",
    novelAiAdminHealthChecksEnabled: true,
    novelAiSmokeTestsEnabled: false,
    galleryOrderSeed: "default",
    galleryOrderUpdatedAt: defaultGalleryOrderUpdatedAt,
  };
}

function buildDefaultRuntimeConfigDocument(): PersistedRuntimeConfigDocument {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    values: buildDefaultRuntimeConfigValues(),
  };
}

function ensureRuntimeConfigDirectory() {
  mkdirSync(path.dirname(runtimeConfigPath), { recursive: true });
}

function readRuntimeConfigFile() {
  const raw = readFileSync(runtimeConfigPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return persistedRuntimeConfigDocumentSchema.parse(parsed);
}

function writeRuntimeConfigFile(document: PersistedRuntimeConfigDocument) {
  ensureRuntimeConfigDirectory();
  writeFileSync(runtimeConfigPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

export function ensureRuntimeConfigInitialized() {
  ensureLegacyRuntimeSystemFilesMigrated();

  if (cachedRuntimeConfig) {
    return cachedRuntimeConfig;
  }

  if (!existsSync(runtimeConfigPath)) {
    const document = buildDefaultRuntimeConfigDocument();
    writeRuntimeConfigFile(document);
    cachedRuntimeConfig = document;
    return document;
  }

  const document = readRuntimeConfigFile();
  cachedRuntimeConfig = document;
  return document;
}

export function getRuntimeConfig() {
  return ensureRuntimeConfigInitialized().values;
}

export function updateRuntimeConfig(input: unknown) {
  const patch = runtimeConfigPatchSchema.parse(input);
  const current = ensureRuntimeConfigInitialized();
  const next: PersistedRuntimeConfigDocument = {
    version: 1,
    updatedAt: new Date().toISOString(),
    values: persistedRuntimeConfigValuesSchema.parse({
      ...current.values,
      ...patch,
    }),
  };
  writeRuntimeConfigFile(next);
  cachedRuntimeConfig = next;
  return next;
}

export function getGalleryOrder() {
  const document = ensureRuntimeConfigInitialized();
  return {
    seed: document.values.galleryOrderSeed,
    updatedAt: document.values.galleryOrderUpdatedAt,
  };
}

export function refreshGalleryOrder() {
  const current = ensureRuntimeConfigInitialized();
  const updatedAt = new Date().toISOString();
  const next: PersistedRuntimeConfigDocument = {
    version: 1,
    updatedAt,
    values: persistedRuntimeConfigValuesSchema.parse({
      ...current.values,
      galleryOrderSeed: randomBytes(8).toString("hex"),
      galleryOrderUpdatedAt: updatedAt,
    }),
  };
  writeRuntimeConfigFile(next);
  cachedRuntimeConfig = next;
  return getGalleryOrder();
}

function parseCredentialEncryptionKey(value: string, message: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw badRequest("INVALID_CREDENTIAL_ENCRYPTION_KEY", message);
  }
  return key;
}

function readPersistedCredentialEncryptionKey() {
  if (!existsSync(credentialEncryptionKeyPath)) {
    return null;
  }
  return readFileSync(credentialEncryptionKeyPath, "utf8").trim();
}

function writePersistedCredentialEncryptionKey(value: string) {
  ensureRuntimeConfigDirectory();
  writeFileSync(credentialEncryptionKeyPath, `${value}\n`, { encoding: "utf8", flag: "wx" });
}

function loadOrCreatePersistedCredentialEncryptionKey() {
  ensureLegacyRuntimeSystemFilesMigrated();

  const existingValue = readPersistedCredentialEncryptionKey();
  if (existingValue) {
    return existingValue;
  }

  const generatedValue = randomBytes(32).toString("base64");
  try {
    writePersistedCredentialEncryptionKey(generatedValue);
    return generatedValue;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return readPersistedCredentialEncryptionKey() ?? generatedValue;
    }
    throw error;
  }
}

export function ensureCredentialEncryptionKeyInitialized() {
  return getCredentialEncryptionKey();
}

export function getCredentialEncryptionKey() {
  if (cachedCredentialEncryptionKey) {
    return cachedCredentialEncryptionKey;
  }

  const persistedValue = loadOrCreatePersistedCredentialEncryptionKey();
  const key = parseCredentialEncryptionKey(
    persistedValue,
    "Persisted NovelAI credential encryption key must be a base64-encoded 32-byte key",
  );
  cachedCredentialEncryptionKey = key;
  return key;
}

export function getCredentialEncryptionStatus() {
  return {
    mode: "auto_file" as const,
    keyPresent: existsSync(credentialEncryptionKeyPath),
  };
}

function readPersistedSessionSecret() {
  if (!existsSync(sessionSecretPath)) {
    return null;
  }
  return readFileSync(sessionSecretPath, "utf8").trim();
}

function writePersistedSessionSecret(value: string) {
  ensureRuntimeConfigDirectory();
  writeFileSync(sessionSecretPath, `${value}\n`, { encoding: "utf8", flag: "wx" });
}

function loadOrCreateSessionSecret() {
  ensureLegacyRuntimeSystemFilesMigrated();

  const existingValue = readPersistedSessionSecret();
  if (existingValue) {
    return existingValue;
  }

  const generatedValue = randomBytes(32).toString("base64");
  try {
    writePersistedSessionSecret(generatedValue);
    return generatedValue;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return readPersistedSessionSecret() ?? generatedValue;
    }
    throw error;
  }
}

export function ensureSessionSecretInitialized() {
  return getSessionSecret();
}

export function getSessionSecret() {
  if (cachedSessionSecret) {
    return cachedSessionSecret;
  }

  const persistedValue = loadOrCreateSessionSecret();
  if (persistedValue.length < 16) {
    throw badRequest("INVALID_SESSION_SECRET", "Session secret must be at least 16 characters");
  }
  cachedSessionSecret = persistedValue;
  return persistedValue;
}

export function getRuntimeConfigPaths() {
  return {
    runtimeConfigPath,
    credentialEncryptionKeyPath,
    sessionSecretPath,
  };
}
