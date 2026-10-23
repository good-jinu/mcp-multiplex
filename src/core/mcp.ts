import { z } from "zod";
import { isExposedToMcp } from "./action.js";
import { executeAction } from "./dispatcher.js";
import { assertValidToolGroup } from "./group.js";
import { buildMultiplexedArgsSchema, buildMultiplexedDescription, EFFECT_ANNOTATIONS, toJsonSchema } from "./schema.js";
import type { ActionDefinition, ContextResolver, PreparedMcpTool, ToolGroupDefinition } from "./types.js";

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

function isPreparedTool(item: PreparedMcpTool | ToolGroupDefinition): item is PreparedMcpTool {
  return item.actions instanceof Map;
}

/**
 * Compiles ToolGroup definitions into PreparedMcpTool objects (already prepared tools pass through).
 * This can be run once at application startup to cache schemas and annotations.
 */
export function prepareMcpTools(toolsOrGroups: (PreparedMcpTool | ToolGroupDefinition)[]): PreparedMcpTool[] {
  const toolNames = new Set<string>();

  return toolsOrGroups.map((group) => {
    if (toolNames.has(group.name)) {
      throw new Error(`[mcp-multiplex] Duplicate tool name '${group.name}'.`);
    }
    toolNames.add(group.name);
    if (isPreparedTool(group)) return group;
    assertValidToolGroup(group);

    const activeActions = group.actions.filter(isExposedToMcp);
    const [firstName, ...otherNames] = activeActions.map((a) => a.name);
    if (firstName === undefined) {
      throw new Error(`[mcp-multiplex] Tool group '${group.name}' has no active actions to expose.`);
    }

    const inputSchema = z.object({
      action: z.enum([firstName, ...otherNames]).describe("The action to execute"),
      args: buildMultiplexedArgsSchema(activeActions).optional().describe("Input arguments for the chosen action"),
    });

    const annotations = {
      title: group.title || group.name,
      openWorldHint: true,
      ...EFFECT_ANNOTATIONS[group.effect],
      ...group.annotationOverrides,
    };

    return {
      name: group.name,
      title: group.title,
      effect: group.effect,
      config: {
        description: buildMultiplexedDescription(group, activeActions),
        inputSchema,
        annotations,
        _meta: {
          "mcp-multiplex/actions": Object.fromEntries(activeActions.map((a) => [a.name, a.effect])),
        },
      },
      actions: new Map<string, ActionDefinition>(activeActions.map((a) => [a.name, a])),
    };
  });
}

export interface RegisterMcpToolsOptions {
  /** Context resolver for actions without their own `context`; use the same one as your HTTP adapter. */
  contextResolver?: ContextResolver;
}

/**
 * Interface representing an McpServer instance supporting tool registration (MCP SDK v2 or v1).
 */
export interface McpServerLike {
  registerTool?: (name: string, config: any, handler: any) => any;
  tool?: (name: string, config: any, handler: any) => any;
}

/**
 * Registers prepared MCP tools (or raw tool groups) onto an McpServer instance (SDK v2 or v1).
 */
export function registerMcpTools<TUser = unknown>(
  server: McpServerLike,
  user: TUser,
  toolsOrGroups: (PreparedMcpTool | ToolGroupDefinition)[],
  options: RegisterMcpToolsOptions = {},
): void {
  if (!server) {
    throw new Error("[mcp-multiplex] McpServer instance is required for tool registration.");
  }

  for (const tool of prepareMcpTools(toolsOrGroups)) {
    const handler = async ({ action, args }: { action: string; args?: unknown }) => {
      const targetAction = tool.actions.get(action);
      if (!targetAction) {
        return formatMcpErrorResult(
          `Unknown action '${action}' on tool '${tool.name}'. Available: ${Array.from(tool.actions.keys()).join(", ")}`,
        );
      }

      const result = await executeAction(targetAction, args, user, options.contextResolver);
      if (result.ok) {
        return formatMcpJsonResult(result.data);
      }
      if (result.error.code === "invalid_input") {
        // Lets the agent retry with correct arguments, including for schemas left out of tools/list
        const schema = toJsonSchema(targetAction.input);
        const hint = schema ? `\n\nExpected args for '${action}':\n${JSON.stringify(schema, null, 2)}` : "";
        return formatMcpErrorResult(`${result.error.message}${hint}`);
      }
      return formatMcpErrorResult(result.error.message);
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
