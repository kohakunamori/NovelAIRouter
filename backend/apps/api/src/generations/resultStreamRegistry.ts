import type { IncomingMessage, ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type ResultConsumer = {
  signal: AbortSignal;
  pipeStream: (stream: Readable, mimeType: string) => Promise<void>;
  fail: (statusCode: number, code: string, message: string) => void;
};

type Entry = {
  consumer: ResultConsumer | undefined;
  waiters: Array<(consumer: ResultConsumer) => void>;
};

class ResultStreamRegistry {
  private readonly entries = new Map<string, Entry>();

  registerConsumer(
    jobId: string,
    request: IncomingMessage,
    response: ServerResponse,
    responseHeaders: Record<string, string> = {},
  ) {
    const entry = this.getEntry(jobId);
    if (entry.consumer) {
      writeJson(response, 409, "RESULT_CONSUMER_ALREADY_ATTACHED", "Result consumer already attached", responseHeaders);
      return;
    }

    const abortController = new AbortController();
    let started = false;

    const consumer: ResultConsumer = {
      signal: abortController.signal,
      pipeStream: async (stream, mimeType) => {
        started = true;
        if (response.writableEnded) throw new Error("Result response already ended");
        response.writeHead(200, {
          ...responseHeaders,
          "Content-Type": mimeType,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        try {
          await pipeline(stream, response);
        } finally {
          this.deleteConsumer(jobId, consumer);
        }
      },
      fail: (statusCode, code, message) => {
        writeJson(response, statusCode, code, message, responseHeaders);
        this.deleteConsumer(jobId, consumer);
      },
    };

    request.on("close", () => {
      if (!started && !response.writableEnded) {
        abortController.abort();
        this.deleteConsumer(jobId, consumer);
      }
    });

    entry.consumer = consumer;
    for (const resolve of entry.waiters.splice(0)) resolve(consumer);
  }

  waitForConsumer(jobId: string, timeoutMs: number) {
    const existing = this.entries.get(jobId)?.consumer;
    if (existing) return Promise.resolve(existing);

    const entry = this.getEntry(jobId);
    return new Promise<ResultConsumer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        entry.waiters = entry.waiters.filter((waiter) => waiter !== wrappedResolve);
        reject(new Error("Timed out waiting for result consumer"));
      }, timeoutMs);

      const wrappedResolve = (consumer: ResultConsumer) => {
        clearTimeout(timeout);
        resolve(consumer);
      };

      entry.waiters.push(wrappedResolve);
    });
  }

  private getEntry(jobId: string) {
    const existing = this.entries.get(jobId);
    if (existing) return existing;

    const entry: Entry = { consumer: undefined, waiters: [] };
    this.entries.set(jobId, entry);
    return entry;
  }

  private deleteConsumer(jobId: string, consumer: ResultConsumer) {
    const entry = this.entries.get(jobId);
    if (!entry || entry.consumer !== consumer) return;
    entry.consumer = undefined;
    if (entry.waiters.length === 0) this.entries.delete(jobId);
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  responseHeaders: Record<string, string> = {},
) {
  if (response.writableEnded) return;
  response.writeHead(statusCode, {
    ...responseHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ error: { code, message } }));
}

export const resultStreamRegistry = new ResultStreamRegistry();
