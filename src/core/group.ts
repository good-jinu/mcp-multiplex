import type { ToolGroupDefinition } from "./types.js";

/**
 * Define an MCP tool group.
 * Ensures all actions in the group share the same safety effect ('read', 'write', or 'destructive').
 */
export function defineToolGroup(definition: ToolGroupDefinition): ToolGroupDefinition {
  const activeActions = definition.actions.filter((a) => a.mcp !== false && a.agent !== false && !a.mcpExcluded);

  for (const action of activeActions) {
    if (action.effect !== definition.effect) {
      throw new Error(
        `[mcp-multiplex] Tool group '${definition.name}' (${definition.effect}) contains action '${action.name}' with mismatched effect '${action.effect}'. ` +
          `MCP annotations apply at the tool level, so actions with different effects must be in separate groups.`,
      );
    }
  }

  return definition;
}
