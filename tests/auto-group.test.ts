import { describe, expect, it } from "vitest";
import { z } from "zod";
import { autoGroupActions, defineAction } from "../src/index.js";

describe("autoGroupActions", () => {
  const readAction = defineAction({
    name: "read_doc",
    description: "Read document",
    effect: "read",
    input: z.object({ id: z.string() }),
    handler: () => "doc",
  });

  const writeAction = defineAction({
    name: "create_doc",
    description: "Create document",
    effect: "write",
    input: z.object({ title: z.string() }),
    handler: () => "created",
  });

  const deleteAction = defineAction({
    name: "delete_doc",
    description: "Delete document",
    effect: "destructive",
    input: z.object({ id: z.string() }),
    handler: () => "deleted",
  });

  const excludedAction = defineAction({
    name: "secret_admin",
    description: "Secret admin",
    effect: "destructive",
    mcp: false,
    input: z.object({}),
    handler: () => "secret",
  });

  it("should auto-group actions by effect into read_tools, manage_tools, delete_tools", () => {
    const groups = autoGroupActions([readAction, writeAction, deleteAction, excludedAction]);

    expect(groups).toHaveLength(3);

    const readGroup = groups.find((g) => g.effect === "read")!;
    expect(readGroup.name).toBe("read_tools");
    expect(readGroup.actions).toEqual([readAction]);

    const writeGroup = groups.find((g) => g.effect === "write")!;
    expect(writeGroup.name).toBe("manage_tools");
    expect(writeGroup.actions).toEqual([writeAction]);

    const deleteGroup = groups.find((g) => g.effect === "destructive")!;
    expect(deleteGroup.name).toBe("delete_tools");
    expect(deleteGroup.actions).toEqual([deleteAction]); // excludedAction should be filtered out
  });

  it("should omit empty groups when no actions match effect", () => {
    const groups = autoGroupActions([readAction]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.effect).toBe("read");
  });

  it("should respect custom options", () => {
    const groups = autoGroupActions([readAction], {
      names: { read: "custom_reader" },
      titles: { read: "Custom Reader Title" },
      summaries: { read: "Custom summary text" },
    });

    expect(groups[0]?.name).toBe("custom_reader");
    expect(groups[0]?.title).toBe("Custom Reader Title");
    expect(groups[0]?.summary).toBe("Custom summary text");
  });
});
