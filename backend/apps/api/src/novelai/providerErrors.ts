export class NovelAiProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function providerNotConfigured(message: string) {
  return new NovelAiProviderError("REAL_PROVIDER_NOT_CONFIGURED", message, false);
}
