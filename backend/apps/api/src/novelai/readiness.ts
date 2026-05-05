type NovelAiReadinessInput = {
  activeAccountCount: number;
  configuredAccountCount?: number;
  credentialErrorAccountCount?: number;
};

export type NovelAiReadiness = {
  readyForRealGeneration: boolean;
  blockers: string[];
};

export function getNovelAiReadiness(input: NovelAiReadinessInput): NovelAiReadiness {
  const blockers: string[] = [];

  if (input.activeAccountCount < 1) {
    if ((input.configuredAccountCount ?? 0) > 0 && (input.credentialErrorAccountCount ?? 0) > 0) {
      blockers.push("Configured NovelAI accounts exist, but their credentials cannot be decrypted. Restore the previous credential encryption key or rotate the account credentials.");
    } else {
      blockers.push("No active NovelAI account is available in the pool");
    }
  }

  return {
    readyForRealGeneration: blockers.length === 0,
    blockers,
  };
}
