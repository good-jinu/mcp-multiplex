import { isExposedToMcp } from "./action.js";
import type { ToolGroupDefinition } from "./types.js";

/**
 * Throw if a tool group cannot be exposed safely: MCP annotations apply per tool, so every exposed
 * action must share the group's effect, and action names must be unique within the group.
 */
export function assertValidToolGroup(group: ToolGroupDefinition): void {
  const seen = new Set<string>();
  for (const action of group.actions.filter(isExposedToMcp)) {
    if (action.effect !== group.effect) {
      throw new Error(
        `[mcp-multiplex] Tool group '${group.name}' (${group.effect}) contains action '${action.name}' with mismatched effect '${action.effect}'. ` +
          `MCP annotations apply at the tool level, so actions with different effects must be in separate groups.`,
      );
    }
    if (seen.has(action.name)) {
      throw new Error(`[mcp-multiplex] Tool group '${group.name}' contains action '${action.name}' more than once.`);
    }
    seen.add(action.name);
  }
}

/**
 * Define an MCP tool group.
 * Ensures all actions in the group share the same safety effect ('read', 'write', or 'destructive').
 */
export function defineToolGroup(definition: ToolGroupDefinition): ToolGroupDefinition {
  assertValidToolGroup(definition);
  return definition;
}
