import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAction, fastifyMultiplex } from "../src/index.js";

describe("mcp-multiplex Fastify Adapter", () => {
  it("should mount and execute actions on Fastify", async () => {
    const fastify = Fastify();

    // Mock auth hook
    fastify.addHook("onRequest", async (request) => {
      (request as any).user = { id: "fastify_usr_1", name: "Fastify User" };
    });

    const getArticle = defineAction({
      name: "get_article",
      description: "Get article",
      effect: "read",
      input: z.object({ id: z.string() }),
      http: { method: "get", path: "/articles/:id" },
      handler: async (ctx, input) => ({ author: ctx.name, articleId: input.id }),
    });

    const createArticle = defineAction({
      name: "create_article",
      description: "Create article",
      effect: "write",
      input: z.object({ title: z.string().min(3) }),
      http: { method: "post", path: "/articles" },
      handler: async (_ctx, input) => ({ id: "art_100", title: input.title }),
    });

    await fastify.register(fastifyMultiplex, {
      actions: [getArticle, createArticle],
    });

    // 1. Test GET /articles/42
    const getRes = await fastify.inject({
      method: "GET",
      url: "/articles/42",
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual({ author: "Fastify User", articleId: "42" });

    // 2. Test POST /articles
    const postRes = await fastify.inject({
      method: "POST",
      url: "/articles",
      payload: { title: "Fastify + MCP Guide" },
    });
    expect(postRes.statusCode).toBe(200);
    expect(postRes.json()).toEqual({ id: "art_100", title: "Fastify + MCP Guide" });

    // 3. Test validation failure on POST
    const badRes = await fastify.inject({
      method: "POST",
      url: "/articles",
      payload: { title: "A" },
    });
    expect(badRes.statusCode).toBe(400);
  });
});
