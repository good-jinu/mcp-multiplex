import express from "express";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createExpressRouter, defineAction } from "../src/index.js";

describe("mcp-multiplex Express Adapter", () => {
  it("should handle GET, POST, and DELETE requests", async () => {
    const app = express();
    app.use(express.json());

    // Mock auth middleware populating req.user
    app.use((req, _res, next) => {
      (req as any).user = { id: "usr_42", role: "admin" };
      next();
    });

    const getAction = defineAction({
      name: "get_user",
      description: "Get user by ID",
      effect: "read",
      input: z.object({ id: z.string() }),
      http: { method: "get", path: "/users/:id" },
      handler: async (ctx, input) => ({ caller: ctx.id, target: input.id }),
    });

    const createAction = defineAction({
      name: "create_user",
      description: "Create user",
      effect: "write",
      input: z.object({ name: z.string().min(2) }),
      http: { method: "post", path: "/users" },
      handler: async (_ctx, input) => ({ id: "100", name: input.name }),
    });

    app.use("/api", createExpressRouter([getAction, createAction]));

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}`;

    try {
      // 1. Test GET /api/users/99
      const getRes = await fetch(`${baseUrl}/api/users/99`);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData).toEqual({ caller: "usr_42", target: "99" });

      // 2. Test POST /api/users
      const postRes = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bob" }),
      });
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData).toEqual({ id: "100", name: "Bob" });

      // 3. Test POST /api/users validation failure
      const badRes = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      });
      expect(badRes.status).toBe(400);
    } finally {
      server.close();
    }
  });
});
