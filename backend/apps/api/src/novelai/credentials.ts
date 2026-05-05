import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { novelAiCredentialPayloadSchema, type MaskedCredentialMetadata, type NovelAiCredentialPayload } from "@novelai-router/shared";
import { getRuntimeConfig, getCredentialEncryptionKey as getManagedCredentialEncryptionKey } from "../runtimeConfig.js";

export type EncryptedCredentialRecord = {
  credentialCiphertext: string;
  credentialIv: string;
  credentialAuthTag: string;
  credentialKeyVersion: number;
};

export const unreadableCredentialErrorCode = "NOVELAI_CREDENTIAL_DECRYPT_FAILED";
export const unreadableCredentialErrorMessage = "NovelAI account credentials cannot be decrypted. Restore the previous credential encryption key or rotate this account's credentials.";

export type CredentialDecryptResult =
  | { ok: true; credential: NovelAiCredentialPayload }
  | { ok: false; code: typeof unreadableCredentialErrorCode; message: string };

export function encryptCredential(
  payload: unknown,
  key = getCredentialEncryptionKey(),
  keyVersion = getRuntimeConfig().novelAiCredentialKeyVersion,
): EncryptedCredentialRecord {
  const credential = novelAiCredentialPayloadSchema.parse(payload);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(credential);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    credentialCiphertext: ciphertext.toString("base64"),
    credentialIv: iv.toString("base64"),
    credentialAuthTag: authTag.toString("base64"),
    credentialKeyVersion: keyVersion,
  };
}

export function decryptCredential(record: EncryptedCredentialRecord, key = getCredentialEncryptionKey()) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.credentialIv, "base64"));
  decipher.setAuthTag(Buffer.from(record.credentialAuthTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.credentialCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return novelAiCredentialPayloadSchema.parse(JSON.parse(plaintext));
}

export function tryDecryptCredential(record: EncryptedCredentialRecord): CredentialDecryptResult {
  try {
    return { ok: true, credential: decryptCredential(record) };
  } catch {
    return { ok: false, code: unreadableCredentialErrorCode, message: unreadableCredentialErrorMessage };
  }
}

export function unreadableCredentialMetadata(): MaskedCredentialMetadata {
  return {
    hasToken: false,
    hasCookie: false,
    headerNames: [],
    notes: null,
  };
}

export function maskCredentialMetadata(payload: unknown): MaskedCredentialMetadata {
  const credential = novelAiCredentialPayloadSchema.parse(payload);
  return {
    hasToken: Boolean(credential.token),
    hasCookie: Boolean(credential.cookie),
    headerNames: Object.keys(credential.headers ?? {}).sort(),
    notes: credential.notes ?? null,
  };
}

export function maskEncryptedCredentialMetadata(record: EncryptedCredentialRecord) {
  return maskCredentialMetadata(decryptCredential(record));
}

export function getCredentialEncryptionKey() {
  return getManagedCredentialEncryptionKey();
}

export type DecryptedNovelAiCredential = NovelAiCredentialPayload;
