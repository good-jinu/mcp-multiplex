import type { CapabilityError } from "./types.js";

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
