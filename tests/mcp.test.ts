import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAction, defineToolGroup, prepareMcpTools, registerMcpTools } from "../src/index.js";

describe("mcp-multiplex MCP Tools", () => {
  it("should compile tool groups and attach correct annotations", () => {
    const listDocs = defineAction({
      name: "list_docs",
      description: "List documents",
      effect: "read",
      input: z.object({ limit: z.number().default(10) }),
      handler: async () => ["doc1", "doc2"],
    });

    const group = defineToolGroup({
      name: "browse",
      title: "Document Browser",
      effect: "read",
      summary: "Browse workspace documentation",
      actions: [listDocs],
    });

    const [prepared] = prepareMcpTools([group]);

    expect(prepared.name).toBe("browse");
    expect(prepared.effect).toBe("read");
    expect((prepared.config.annotations as any).readOnlyHint).toBe(true);
    expect((prepared.config.annotations as any).destructiveHint).toBe(false);
    expect(prepared.actions.has("list_docs")).toBe(true);
  });

  it("should filter out mcpExcluded and agent:false actions", () => {
    const publicAction = defineAction({
      name: "public_action",
      description: "Public action",
      effect: "read",
      input: z.object({}),
      handler: async () => "ok",
    });

    const adminAction = defineAction({
      name: "admin_secret",
      description: "Admin secret",
      effect: "read",
      input: z.object({}),
      handler: async () => "secret",
      mcpExcluded: "Admin UI only",
    });

    const agentDisabledAction = defineAction({
      name: "billing_config",
      description: "Billing",
      effect: "read",
      input: z.object({}),
      handler: async () => "billing",
      agent: false,
    });

    const group = defineToolGroup({
      name: "safe_tools",
      effect: "read",
      summary: "Safe tools",
      actions: [publicAction, adminAction, agentDisabledAction],
    });

    const [prepared] = prepareMcpTools([group]);
    expect(prepared.actions.has("public_action")).toBe(true);
    expect(prepared.actions.has("admin_secret")).toBe(false);
    expect(prepared.actions.has("billing_config")).toBe(false);
  });

  it("should register on mock server and execute dispatched actions", async () => {
    const registeredTools = new Map<string, { config: any; handler: Function }>();
    const mockServer = {
      registerTool: (name: string, config: any, handler: Function) => {
        registeredTools.set(name, { config, handler });
      },
    };

    const echoAction = defineAction({
      name: "echo",
      description: "Echo message",
      effect: "read",
      input: z.object({ message: z.string() }),
      handler: async (ctx, input) => ({ user: ctx.name, echo: input.message }),
    });

    const group = defineToolGroup({
      name: "utilities",
      effect: "read",
      summary: "Utility tools",
      actions: [echoAction],
    });

    registerMcpTools(mockServer, { name: "Alice" }, [group]);

    expect(registeredTools.has("utilities")).toBe(true);
    const tool = registeredTools.get("utilities")!;

    // Call tool with valid action
    const response = await tool.handler({
      action: "echo",
      args: { message: "Hello AI" },
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].type).toBe("text");
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toEqual({ user: "Alice", echo: "Hello AI" });

    // Call tool with unknown action
    const unknownResp = await tool.handler({ action: "non_existent", args: {} });
    expect(unknownResp.isError).toBe(true);
    expect(unknownResp.content[0].text).toContain("Unknown action 'non_existent'");
  });
});
