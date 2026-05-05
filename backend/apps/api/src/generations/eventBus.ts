import { EventEmitter } from "node:events";
import type { GenerationEvent } from "@novelai-router/shared";

class GenerationEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: GenerationEvent) {
    this.emitter.emit(event.jobId, event);
  }

  subscribe(jobId: string, listener: (event: GenerationEvent) => void) {
    this.emitter.on(jobId, listener);
    return () => this.emitter.off(jobId, listener);
  }
}

export const generationEventBus = new GenerationEventBus();

export function nowIso() {
  return new Date().toISOString();
}
