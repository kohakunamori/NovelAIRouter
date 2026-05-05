export function buildAllowedOrigins(configuredOrigins: string) {
  return new Set([
    ...configuredOrigins.split(",").map((origin) => origin.trim()).filter(Boolean),
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ]);
}

export function getCorsHeaders(origin: string | string[] | undefined, allowedOrigins: Set<string>) {
  if (typeof origin !== "string" || !allowedOrigins.has(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}
