import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { BinaryStorageAdapter, StoreBufferInput } from "./adapter.js";

export class DiskStorageAdapter implements BinaryStorageAdapter {
  constructor(private readonly rootPath: string) {}

  async writeBuffer(input: StoreBufferInput) {
    const key = buildStorageKey(input);
    const absolutePath = this.resolveKey(key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
    return {
      key,
      byteSize: input.buffer.byteLength,
    };
  }

  createReadStream(key: string) {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string) {
    await unlink(this.resolveKey(key)).catch(() => undefined);
  }

  private resolveKey(key: string) {
    const absoluteRoot = resolve(this.rootPath);
    const absolutePath = resolve(absoluteRoot, key);
    const rootWithSeparator = absoluteRoot.endsWith(sep) ? absoluteRoot : `${absoluteRoot}${sep}`;
    if (absolutePath !== absoluteRoot && !absolutePath.startsWith(rootWithSeparator)) {
      throw new Error("Attempted to access storage outside configured root");
    }
    return absolutePath;
  }
}

function buildStorageKey(input: StoreBufferInput) {
  const now = new Date();
  const year = `${now.getUTCFullYear()}`;
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const extension = resolveExtension(input);
  return join(input.prefix ?? "assets", year, month, `${randomUUID()}${extension}`).replace(/\\/g, "/");
}

function resolveExtension(input: StoreBufferInput) {
  const fromName = input.originalFilename ? extname(input.originalFilename).toLowerCase() : "";
  if (fromName) return fromName;
  if (input.contentType === "image/png") return ".png";
  if (input.contentType === "image/jpeg") return ".jpg";
  if (input.contentType === "image/webp") return ".webp";
  if (input.contentType === "image/gif") return ".gif";
  return ".bin";
}
