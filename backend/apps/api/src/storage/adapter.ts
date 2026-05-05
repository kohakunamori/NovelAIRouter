import type { ReadStream } from "node:fs";

export type StoreBufferInput = {
  buffer: Buffer;
  contentType: string;
  originalFilename?: string | null;
  prefix?: string;
};

export type StoredBinary = {
  key: string;
  byteSize: number;
};

export interface BinaryStorageAdapter {
  writeBuffer(input: StoreBufferInput): Promise<StoredBinary>;
  createReadStream(key: string): ReadStream;
  delete(key: string): Promise<void>;
}
