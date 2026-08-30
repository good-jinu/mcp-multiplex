import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHonoRoutes, defineAction } from "../src/index.js";

describe("mcp-multiplex Hono Adapter", () => {
  it("should handle Hono routes seamlessly via Web Standard Request", async () => {
    const app = new Hono();

    // Mock auth middleware
    app.use("*", async (c, next) => {
      c.set("user", { id: "hono_usr_1", email: "hono@example.com" });
      await next();
    });

    const getDocAction = defineAction({
      name: "get_document",
      description: "Get document",
      effect: "read",
      input: z.object({ docId: z.string() }),
      http: { method: "get", path: "/documents/:docId" },
      handler: async (ctx, input) => ({ requester: ctx.email, doc: input.docId }),
    });

    const createDocAction = defineAction({
      name: "create_document",
      description: "Create document",
      effect: "write",
      input: z.object({ title: z.string().min(3) }),
      http: { method: "post", path: "/documents" },
      handler: async (_ctx, input) => ({ id: "doc_999", title: input.title }),
    });

    app.route("/api", createHonoRoutes([getDocAction, createDocAction]));

    // 1. Test GET /api/documents/readme
    const getReq = new Request("http://localhost/api/documents/readme");
    const getRes = await app.request(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData).toEqual({ requester: "hono@example.com", doc: "readme" });

    // 2. Test POST /api/documents
    const postReq = new Request("http://localhost/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Architecture Spec" }),
    });
    const postRes = await app.request(postReq);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData).toEqual({ id: "doc_999", title: "Architecture Spec" });

    // 3. Test validation error on POST
    const badReq = new Request("http://localhost/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No" }),
    });
    const badRes = await app.request(badReq);
    expect(badRes.status).toBe(400);
  });
});
