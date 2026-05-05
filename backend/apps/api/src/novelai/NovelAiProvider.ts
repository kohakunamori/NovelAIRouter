import type { GenerationParams, NovelAiCredentialPayload, SuggestTag } from "@novelai-router/shared";

export type ResolvedImageAsset = {
  mimeType: string;
  buffer: Buffer;
  originalFilename: string | null;
};

export type ResolvedVibeTransfer = ResolvedImageAsset & {
  strength: number;
  informationExtracted: boolean;
};

export type ResolvedPreciseReference = ResolvedImageAsset & {
  prompt: string;
  strength: number;
  secondaryStrength: number;
  informationExtracted: boolean;
};

export type NovelAiResolvedAssets = {
  sourceImage: ResolvedImageAsset | null;
  baseImage: (ResolvedImageAsset & { strength: number }) | null;
  vibeTransfers: ResolvedVibeTransfer[];
  preciseReferences: ResolvedPreciseReference[];
};

export type NovelAiIntermediateFrame = {
  outputIndex: number;
  stepIndex: number;
  totalSteps: number | null;
  sigma: number | null;
  providerGenerationId: string | null;
  mimeType: string;
  buffer: Buffer;
};

export type NovelAiGenerateInput = {
  jobId: string;
  params: GenerationParams;
  resolvedAssets: NovelAiResolvedAssets;
  signal: AbortSignal;
  accountId?: string;
  credential?: unknown;
  onProgress?: (message: string) => void;
  onIntermediateFrame?: (frame: NovelAiIntermediateFrame) => Promise<void> | void;
};

export type NovelAiGenerateResult = {
  requestId: string;
  mimeType: string;
  actualNovelAiAnlas: number | null;
  images: Buffer[];
};

export type NovelAiSuggestTagsInput = {
  model: GenerationParams["model"];
  prompt: string;
  signal: AbortSignal;
  accountId?: string;
  credential?: unknown;
};

export type NovelAiSuggestTagsResult = {
  tags: SuggestTag[];
};

export type NovelAiAccountTestInput = {
  accountId: string;
  credential: NovelAiCredentialPayload;
  signal: AbortSignal;
};

export type NovelAiAccountTestResult = {
  ok: boolean;
  message: string;
  safety: {
    networkUsed: boolean;
    credentialSent: boolean;
    mayConsumeAnlas: boolean;
    anlasConsumed: number | null;
  };
  remote?: {
    accountLabel?: string | null;
    anlasBalance?: number | null;
    requestId?: string | null;
    tier?: number | null;
    active?: boolean | null;
    unlimitedImageGeneration?: boolean | null;
    maxPriorityActions?: number | null;
    fixedTrainingStepsLeft?: number | null;
    purchasedTrainingSteps?: number | null;
  };
};

export interface NovelAiProvider {
  generate(input: NovelAiGenerateInput): Promise<NovelAiGenerateResult>;
  suggestTags(input: NovelAiSuggestTagsInput): Promise<NovelAiSuggestTagsResult>;
  dryRunAccountTest(input: NovelAiAccountTestInput): Promise<NovelAiAccountTestResult>;
  healthCheckAccount(input: NovelAiAccountTestInput): Promise<NovelAiAccountTestResult>;
  smokeTestAccount(input: NovelAiAccountTestInput): Promise<NovelAiAccountTestResult>;
}
