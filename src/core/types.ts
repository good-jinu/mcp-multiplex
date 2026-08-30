import type { z } from "zod";

/**
 * The effect of an action on the environment.
 * Governs MCP tool safety annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
 * and acts as the grouping boundary for action multiplexing.
 */
export type CapabilityEffect = "read" | "write" | "destructive";

/**
 * Normalized error structure across both HTTP responses and MCP error results.
 */
export interface CapabilityError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Resolves execution context from user authentication/session.
 */
export interface ContextResolver<TUser = any, TContext = any> {
  resolve: (user: TUser) => TContext | Promise<TContext>;
  mapError?: (err: unknown) => CapabilityError | undefined;
}

/**
 * Optional HTTP route configuration for an action.
 */
export interface ActionHttpOptions {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  /**
   * Custom parser to extract input from HTTP request before schema validation.
   * If omitted, default parsers (query for GET, body for POST/PUT/PATCH/DELETE) are used.
   */
  parseInput?: (req: any) => unknown;
}

/**
 * Declaration of a single capability/action that can be multiplexed to MCP
 * and optionally exposed over HTTP REST.
 */
export interface ActionDefinition<TContext = any, TInput = any, TOutput = any> {
  /** Unique action identifier (e.g. 'search_documents', 'create_issue') */
  name: string;
  /** Human & AI readable description of what the action does */
  description: string;
  /** Safety effect: 'read' (read-only), 'write' (mutating), or 'destructive' (irreversible delete) */
  effect: CapabilityEffect;
  /** Input validation schema (Zod schema) */
  input: z.ZodType<TInput, any, any>;
  /** Pure business logic handler */
  handler: (ctx: TContext, input: TInput) => Promise<TOutput> | TOutput;
  /** Context resolver for this specific action (or falls back to group/server default) */
  context?: ContextResolver<any, TContext>;
  /** Optional HTTP endpoint configuration */
  http?: ActionHttpOptions;
  /** Domain error mapper */
  mapError?: (err: unknown) => CapabilityError | undefined;
  /** If false or string reason provided, action is excluded from MCP tools (useful for human-only admin routes) */
  mcp?: boolean;
  /** Rationale for excluding from MCP (synonym with setting mcp: false) */
  mcpExcluded?: string;
  /** Alias for mcp (if agent: false, excluded from MCP tools) */
  agent?: boolean;
}

/**
 * Configuration for grouping multiple actions into a single multiplexed MCP tool.
 */
export interface ToolGroupDefinition {
  /** MCP tool name (e.g. 'read_assets', 'manage_orders', 'delete_assets') */
  name: string;
  /** Display title for MCP client UI */
  title?: string;
  /** The effect of this tool group. All actions in this group must match this effect. */
  effect: CapabilityEffect;
  /** Summary of what this tool group is responsible for */
  summary: string;
  /** Actions included in this multiplexed tool */
  actions: ActionDefinition[];
  /** Optional overrides for standard MCP annotations */
  annotationOverrides?: Partial<{
    readOnlyHint: boolean;
    idempotentHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  }>;
}

/**
 * Compiled MCP tool ready for registration onto an McpServer instance.
 */
export interface PreparedMcpTool {
  name: string;
  title?: string;
  effect: CapabilityEffect;
  config: Record<string, unknown>;
  actions: Map<string, ActionDefinition>;
}

export type ExecutionResult<T> = { ok: true; data: T } | { ok: false; error: CapabilityError };
