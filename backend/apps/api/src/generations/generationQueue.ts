import { Queue } from "bullmq";
import { redis } from "../redis.js";

export type GenerationJobData = {
  generationJobId: string;
};

export const generationQueue = new Queue<GenerationJobData>("generation", {
  connection: redis,
});

export async function enqueueGeneration(generationJobId: string) {
  return generationQueue.add(
    "generate",
    { generationJobId },
    {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}
