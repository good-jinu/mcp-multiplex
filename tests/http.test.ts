import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFetchHandler } from "../src/adapters/fetch.js";
import { defineAction } from "../src/index.js";

const deleteIssue = defineAction({
  name: "delete_issue",
  description: "Delete an issue",
  effect: "destructive",
  input: z.object({ id: z.string() }),
  http: { method: "delete", path: "/issues/:id" },
  handler: async (_ctx, input) => ({ deleted: input.id }),
});

const createIssue = defineAction({
  name: "create_issue",
  description: "Create an issue",
  effect: "write",
  input: z.object({ title: z.string() }),
  http: { method: "post", path: "/issues" },
  handler: async (_ctx, input) => ({ title: input.title }),
});

const handler = createFetchHandler([deleteIssue, createIssue], { basePath: "/api" });

describe("HTTP input handling (fetch adapter)", () => {
  it("path parameters win over body fields", async () => {
    const res = await handler(
      new Request("http://localhost/api/issues/1", { method: "DELETE", body: JSON.stringify({ id: "2" }) }),
    );
    expect(await res.json()).toEqual({ deleted: "1" });
  });

  it("rejects a body that is not valid JSON with 400", async () => {
    const res = await handler(new Request("http://localhost/api/issues", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_json" });
  });

  it("matches the base path by whole segments", async () => {
    const res = await handler(
      new Request("http://localhost/apiary/issues", { method: "POST", body: JSON.stringify({ title: "x" }) }),
    );
    expect(res.status).toBe(404);
  });

  it("treats malformed percent-encoding as no match instead of crashing", async () => {
    const res = await handler(new Request("http://localhost/api/issues/%E0%A4%A", { method: "DELETE" }));
    expect(res.status).toBe(404);
  });

  it("reports which field failed validation", async () => {
    const res = await handler(new Request("http://localhost/api/issues", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/^title: /);
  });
});
