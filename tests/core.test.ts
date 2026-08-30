import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createActionDispatcher, defineAction, defineToolGroup, executeAction } from "../src/index.js";

describe("mcp-multiplex Core", () => {
  it("should define an action and execute it successfully", async () => {
    const searchAction = defineAction({
      name: "search_docs",
      description: "Search documents",
      effect: "read",
      input: z.object({ query: z.string(), limit: z.number().default(5) }),
      handler: async (ctx, input) => {
        return { user: ctx.userId, results: [`Result for ${input.query}`], limit: input.limit };
      },
    });

    const result = await executeAction(searchAction, { query: "vitest" }, { userId: "user_123" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        user: "user_123",
        results: ["Result for vitest"],
        limit: 5,
      });
    }
  });

  it("should fail validation on invalid input schema", async () => {
    const createAction = defineAction({
      name: "create_user",
      description: "Create user",
      effect: "write",
      input: z.object({ email: z.string().email("Invalid email") }),
      handler: async (_ctx, input) => ({ id: "1", email: input.email }),
    });

    const result = await executeAction(createAction, { email: "not-an-email" }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      expect(result.error.code).toBe("invalid_input");
      expect(result.error.message).toContain("Invalid email");
    }
  });

  it("should map custom domain errors", async () => {
    class CustomNotFoundError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "CustomNotFoundError";
      }
    }

    const getDoc = defineAction({
      name: "get_doc",
      description: "Get doc",
      effect: "read",
      input: z.object({ id: z.string() }),
      handler: async () => {
        throw new CustomNotFoundError("Doc not found");
      },
      mapError: (err) => {
        if (err instanceof CustomNotFoundError) {
          return { status: 404, code: "doc_not_found", message: err.message };
        }
        return undefined;
      },
    });

    const result = await executeAction(getDoc, { id: "404" }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(404);
      expect(result.error.code).toBe("doc_not_found");
      expect(result.error.message).toBe("Doc not found");
    }
  });

  it("should reject tool groups with mismatched effects", () => {
    const readAction = defineAction({
      name: "read_action",
      description: "Read",
      effect: "read",
      input: z.object({}),
      handler: async () => {},
    });

    const writeAction = defineAction({
      name: "write_action",
      description: "Write",
      effect: "write",
      input: z.object({}),
      handler: async () => {},
    });

    expect(() =>
      defineToolGroup({
        name: "invalid_group",
        effect: "read",
        summary: "Invalid",
        actions: [readAction, writeAction],
      }),
    ).toThrow(/mismatched effect/);
  });

  it("should dispatch actions using createActionDispatcher", async () => {
    const pingAction = defineAction({
      name: "ping",
      description: "Ping",
      effect: "read",
      input: z.object({ msg: z.string() }),
      handler: async (_ctx, input) => `pong: ${input.msg}`,
    });

    const dispatcher = createActionDispatcher([pingAction]);
    const result = await dispatcher.execute("ping", { msg: "hello" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("pong: hello");
    }

    const missing = await dispatcher.execute("unknown", {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe("action_not_found");
    }
  });
});
