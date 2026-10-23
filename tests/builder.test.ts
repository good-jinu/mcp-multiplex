import { describe, expect, it } from "vitest";
import { z } from "zod";
import { initMultiplex } from "../src/index.js";

describe("initMultiplex Context Builder", () => {
  interface CustomContext {
    userId: string;
    role: "admin" | "member";
    orgId: string;
  }

  const m = initMultiplex<CustomContext>();

  it("should infer context type automatically in action handler", async () => {
    const getProfile = m.action({
      name: "get_profile",
      description: "Get user profile",
      effect: "read",
      input: z.object({ includeDetails: z.boolean().default(false) }),
      handler: (ctx, input) => {
        // ctx has userId, role, orgId statically typed
        return {
          id: ctx.userId,
          role: ctx.role,
          org: ctx.orgId,
          details: input.includeDetails,
        };
      },
    });

    expect(getProfile.name).toBe("get_profile");
    expect(getProfile.effect).toBe("read");

    const mockCtx: CustomContext = { userId: "u123", role: "admin", orgId: "org456" };
    const res = await getProfile.handler(mockCtx, { includeDetails: true });
    expect(res).toEqual({
      id: "u123",
      role: "admin",
      org: "org456",
      details: true,
    });
  });

  it("should define groups via instance.group and instance.toolGroup", () => {
    const sampleAction = m.action({
      name: "sample_action",
      description: "sample",
      effect: "read",
      input: z.object({}),
      handler: () => "ok",
    });

    const g1 = m.group({
      name: "read_group",
      effect: "read",
      summary: "Read group",
      actions: [sampleAction],
    });

    const g2 = m.toolGroup({
      name: "read_group_2",
      effect: "read",
      summary: "Read group 2",
      actions: [sampleAction],
    });

    expect(g1.name).toBe("read_group");
    expect(g2.name).toBe("read_group_2");
  });
});
