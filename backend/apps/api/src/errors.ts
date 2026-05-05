import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AccountPoolError } from "./novelai/accountPool.js";
import { NovelAiProviderError } from "./novelai/providerErrors.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(code: string, message: string, details?: unknown) {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = "Authentication required") {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden") {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Not found") {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(code: string, message: string) {
  return new AppError(409, code, message);
}

export function toPublicError(error: unknown) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.issues,
        },
      },
    };
  }

  if (error instanceof AccountPoolError) {
    return {
      statusCode: 409,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  if (error instanceof NovelAiProviderError) {
    return {
      statusCode: getNovelAiProviderStatusCode(error),
      body: { error: { code: error.code, message: error.message, retryable: error.retryable } },
    };
  }

  if (isFastifyClientError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  return {
    statusCode: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
  };
}

function getNovelAiProviderStatusCode(error: NovelAiProviderError) {
  if (error.code === "PROVIDER_TIMEOUT") return 504;
  if (error.code === "PROVIDER_NETWORK_ERROR") return 502;
  if (error.code === "PROVIDER_RATE_LIMITED") return 429;
  if (error.code === "PROVIDER_AUTH_FAILED") return 400;
  if (error.code === "REAL_PROVIDER_NOT_CONFIGURED") return 400;
  return error.retryable ? 502 : 400;
}

function isFastifyClientError(error: unknown): error is FastifyError & { statusCode: number } {
  return Boolean(
    error
      && typeof error === "object"
      && "statusCode" in error
      && typeof error.statusCode === "number"
      && error.statusCode >= 400
      && error.statusCode < 500
      && "code" in error
      && typeof error.code === "string"
      && "message" in error
      && typeof error.message === "string"
  );
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const publicError = toPublicError(error);
  if (publicError.statusCode >= 500) {
    request.log.error(error);
  } else {
    request.log.warn(error);
  }
  return reply.code(publicError.statusCode).send(publicError.body);
}
