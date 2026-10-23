import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAction, prepareMcpTools, registerMcpTools } from "../src/index.js";

describe("Direct 1:1 MCP Action Tools", () => {
  const getProduct = defineAction({
    name: "get_product",
    description: "Fetch product by ID",
    effect: "read",
    input: z.object({ id: z.string().describe("Product ID") }),
    handler: (_ctx, input) => ({ id: input.id, name: "Keyboard" }),
  });

  const updateProduct = defineAction({
    name: "update_product",
    description: "Update product price",
    effect: "write",
    input: z.object({ id: z.string(), price: z.number().positive() }),
    handler: (_ctx, input) => ({ id: input.id, price: input.price, updated: true }),
  });

  it("should prepare direct actions as 1:1 tools", () => {
    const prepared = prepareMcpTools([getProduct, updateProduct]);

    expect(prepared).toHaveLength(2);

    const [tool1, tool2] = prepared;
    expect(tool1?.name).toBe("get_product");
    expect(tool1?.isDirect).toBe(true);
    expect(tool1?.config.description).toBe("Fetch product by ID");
    expect(tool1?.config.inputSchema).toBe(getProduct.input);

    expect(tool2?.name).toBe("update_product");
    expect(tool2?.isDirect).toBe(true);
    expect(tool2?.config.description).toBe("Update product price");
  });

  it("should register and execute direct 1:1 tools without action wrapper", async () => {
    const registeredTools = new Map<string, { config: any; handler: Function }>();
    const fakeServer = {
      registerTool: (name: string, config: any, handler: Function) => {
        registeredTools.set(name, { config, handler });
      },
    };

    registerMcpTools(fakeServer, { id: "user_1" }, [getProduct, updateProduct]);

    expect(registeredTools.has("get_product")).toBe(true);
    expect(registeredTools.has("update_product")).toBe(true);

    // Call get_product passing arguments directly (no { action: "...", args: {...} })
    const getProductTool = registeredTools.get("get_product")!;
    const res = await getProductTool.handler({ id: "prod_99" });

    expect(res).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ id: "prod_99", name: "Keyboard" }, null, 2),
        },
      ],
    });

    // Validation failure on direct tool returns helpful schema hint
    const failRes = await getProductTool.handler({});
    expect(failRes.isError).toBe(true);
    expect(failRes.content[0].text).toContain("id: Invalid input");
    expect(failRes.content[0].text).toContain("Expected args for 'get_product'");
  });
});
