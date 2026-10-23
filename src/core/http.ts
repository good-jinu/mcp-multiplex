import type { CapabilityError, CorsOptions } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Default action input for an HTTP request: query string, then JSON body, then path parameters.
 * Path parameters win, so a body can never redirect `DELETE /issues/:id` to another id.
 */
export function mergeHttpInput(query: unknown, body: unknown, params: unknown): Record<string, unknown> {
  return {
    ...(isRecord(query) ? query : {}),
    ...(isRecord(body) ? body : {}),
    ...(isRecord(params) ? params : {}),
  };
}

/** JSON body of an HTTP error response. */
export function httpErrorBody(error: CapabilityError) {
  return { error: error.code, message: error.message, details: error.details };
}

/** Thrown by `parseJsonBody` for a body that is present but not valid JSON. */
export const INVALID_JSON: CapabilityError = {
  status: 400,
  code: "invalid_json",
  message: "Request body is not valid JSON.",
};

/** Parse a raw request body: empty means no body; anything else must be valid JSON. */
export function parseJsonBody(text: string): { ok: true; body: unknown } | { ok: false; error: CapabilityError } {
  if (text.trim() === "") return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, error: INVALID_JSON };
  }
}

/**
 * Strips trailing slashes from paths while preserving root "/"
 */
export function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export const DEFAULT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-project-id, MCP-Protocol-Version",
};

/**
 * Resolves CORS headers dictionary from boolean or CorsOptions configuration.
 */
export function resolveCorsHeaders(cors?: boolean | CorsOptions): Record<string, string> | undefined {
  if (!cors) return undefined;
  if (cors === true) return { ...DEFAULT_CORS_HEADERS };

  const origin = Array.isArray(cors.origin) ? cors.origin.join(", ") : (cors.origin ?? "*");
  const methods = cors.methods ? cors.methods.join(", ") : DEFAULT_CORS_HEADERS["Access-Control-Allow-Methods"];
  const headers = cors.headers ? cors.headers.join(", ") : DEFAULT_CORS_HEADERS["Access-Control-Allow-Headers"];

  const res: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": headers,
  };

  if (cors.maxAge !== undefined) {
    res["Access-Control-Max-Age"] = String(cors.maxAge);
  }
  if (cors.credentials) {
    res["Access-Control-Allow-Credentials"] = "true";
  }

  return res;
}

/**
 * Returns a 204 No Content response with CORS headers if `cors` is enabled.
 */
export function handleCorsPreflight(cors?: boolean | CorsOptions): Response | undefined {
  const headers = resolveCorsHeaders(cors);
  if (!headers) return undefined;
  return new Response(null, { status: 204, headers });
}

/**
 * Attaches configured CORS headers to a Web Response if not already set.
 */
export function applyCorsHeaders(response: Response, cors?: boolean | CorsOptions): Response {
  const corsHeaders = resolveCorsHeaders(cors);
  if (!corsHeaders) return response;

  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    if (!newHeaders.has(k)) {
      newHeaders.set(k, v);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
