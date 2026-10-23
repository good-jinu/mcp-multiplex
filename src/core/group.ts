import { isExposedToMcp } from "./action.js";
import type { ActionDefinition, AutoGroupOptions, CapabilityEffect, ToolGroupDefinition } from "./types.js";

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

const DEFAULT_GROUP_NAMES: Record<CapabilityEffect, string> = {
  read: "read_tools",
  write: "manage_tools",
  destructive: "delete_tools",
};

const DEFAULT_GROUP_TITLES: Record<CapabilityEffect, string> = {
  read: "Read Operations",
  write: "Write Operations",
  destructive: "Destructive Operations",
};

const DEFAULT_GROUP_SUMMARIES: Record<CapabilityEffect, string> = {
  read: "Read and query operations",
  write: "Mutating create and update operations",
  destructive: "Permanent deletion and redaction operations",
};

/**
 * Automatically groups a flat array of actions into effect-partitioned tool groups
 * ('read_tools', 'manage_tools', 'delete_tools'). Groups with zero exposed actions are omitted.
 */
export function autoGroupActions(actions: ActionDefinition[], options: AutoGroupOptions = {}): ToolGroupDefinition[] {
  const buckets: Record<CapabilityEffect, ActionDefinition[]> = {
    read: [],
    write: [],
    destructive: [],
  };

  for (const action of actions) {
    if (isExposedToMcp(action)) {
      buckets[action.effect].push(action);
    }
  }

  const groups: ToolGroupDefinition[] = [];
  const effects: CapabilityEffect[] = ["read", "write", "destructive"];

  for (const effect of effects) {
    const groupActions = buckets[effect];
    if (groupActions.length === 0) continue;

    groups.push(
      defineToolGroup({
        name: options.names?.[effect] ?? DEFAULT_GROUP_NAMES[effect],
        title: options.titles?.[effect] ?? DEFAULT_GROUP_TITLES[effect],
        effect,
        summary: options.summaries?.[effect] ?? DEFAULT_GROUP_SUMMARIES[effect],
        actions: groupActions,
      }),
    );
  }

  return groups;
}
