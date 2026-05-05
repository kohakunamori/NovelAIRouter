import type { NovelAiProvider } from "./NovelAiProvider.js";
import { RealNovelAiProvider } from "./realNovelAiProvider.js";

export function createNovelAiProvider(): NovelAiProvider {
  return new RealNovelAiProvider();
}
