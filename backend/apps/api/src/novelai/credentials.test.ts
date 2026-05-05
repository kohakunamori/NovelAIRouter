import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential, maskCredentialMetadata, tryDecryptCredential, unreadableCredentialErrorCode } from "./credentials.js";

describe("NovelAI credential encryption", () => {
  it("round-trips credential payloads", () => {
    const key = randomBytes(32);
    const encrypted = encryptCredential({ token: "secret-token", notes: "test" }, key, 1);

    expect(encrypted.credentialCiphertext).not.toContain("secret-token");
    expect(decryptCredential(encrypted, key)).toEqual({ token: "secret-token", notes: "test" });
  });

  it("fails with the wrong key", () => {
    const encrypted = encryptCredential({ cookie: "session=secret" }, randomBytes(32), 1);
    expect(() => decryptCredential(encrypted, randomBytes(32))).toThrow();
  });

  it("returns a management-safe error when credentials cannot decrypt", () => {
    const encrypted = encryptCredential({ cookie: "session=secret" }, randomBytes(32), 1);
    expect(tryDecryptCredential(encrypted)).toEqual({
      ok: false,
      code: unreadableCredentialErrorCode,
      message: "NovelAI account credentials cannot be decrypted. Restore the previous credential encryption key or rotate this account's credentials.",
    });
  });

  it("masks credential metadata without exposing secrets", () => {
    const metadata = maskCredentialMetadata({
      token: "secret-token",
      headers: { "x-test": "secret" },
      notes: "operator note",
    });

    expect(metadata).toEqual({
      hasToken: true,
      hasCookie: false,
      headerNames: ["x-test"],
      notes: "operator note",
    });
  });
});
