import { z } from "zod";
import { executeAction } from "./dispatcher.js";
import { buildMultiplexedArgsSchema, buildMultiplexedDescription, EFFECT_ANNOTATIONS } from "./schema.js";
import type { ActionDefinition, PreparedMcpTool, ToolGroupDefinition } from "./types.js";

export function formatMcpJsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function formatMcpErrorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * Compiles ToolGroup definitions into PreparedMcpTool objects.
 * This can be run once at application startup to cache schemas and annotations.
 */
export function prepareMcpTools(groups: ToolGroupDefinition[]): PreparedMcpTool[] {
  return groups.map((group) => {
    const activeActions = group.actions.filter((a) => a.mcp !== false && a.agent !== false && !a.mcpExcluded);

    if (activeActions.length === 0) {
      throw new Error(`[mcp-multiplex] Tool group '${group.name}' has no active actions to expose.`);
    }

    const actionNames = activeActions.map((a) => a.name) as [string, ...string[]];

    const inputSchema = z.object({
      action: z.enum(actionNames).describe("The action to execute"),
      args: buildMultiplexedArgsSchema(activeActions).optional().describe("Input arguments for the chosen action"),
    });

    const description = buildMultiplexedDescription(group, activeActions);

    const annotations = {
      title: group.title || group.name,
      ...EFFECT_ANNOTATIONS[group.effect],
      ...(group.annotationOverrides ?? {}),
      openWorldHint: true,
    };

    const actionMap = new Map<string, ActionDefinition>(activeActions.map((a) => [a.name, a]));

    return {
      name: group.name,
      title: group.title,
      effect: group.effect,
      config: {
        description,
        inputSchema,
        annotations,
        _meta: {
          "mcp-multiplex/actions": Object.fromEntries(activeActions.map((a) => [a.name, a.effect])),
        },
      },
      actions: actionMap,
    };
  });
}

/**
 * Registers prepared MCP tools (or raw tool groups) onto an McpServer instance (SDK v2 or v1).
 */
export function registerMcpTools(
  server: any,
  user: any,
  toolsOrGroups: (PreparedMcpTool | ToolGroupDefinition)[],
): void {
  if (!server) {
    throw new Error("[mcp-multiplex] McpServer instance is required for tool registration.");
  }

  const preparedTools: PreparedMcpTool[] = toolsOrGroups.map((item) => {
    if ("actions" in item && item.actions instanceof Map) {
      return item as PreparedMcpTool;
    }
    const [prepared] = prepareMcpTools([item as ToolGroupDefinition]);
    return prepared!;
  });

  for (const tool of preparedTools) {
    const handler = async ({ action, args }: { action: string; args?: unknown }) => {
      const targetAction = tool.actions.get(action);
      if (!targetAction) {
        return formatMcpErrorResult(
          `Unknown action '${action}' on tool '${tool.name}'. Available: ${Array.from(tool.actions.keys()).join(", ")}`,
        );
      }

      const result = await executeAction(targetAction, args, user);
      if (!result.ok) {
        return formatMcpErrorResult(result.error.message);
      }

      return formatMcpJsonResult(result.data);
    };

    // Support both registerTool and tool APIs (v2 / v1)
    if (typeof server.registerTool === "function") {
      server.registerTool(tool.name, tool.config, handler);
    } else if (typeof server.tool === "function") {
      server.tool(tool.name, tool.config, handler);
    } else {
      throw new Error(`[mcp-multiplex] Target server does not support 'registerTool' or 'tool' registration method.`);
    }
  }
}
