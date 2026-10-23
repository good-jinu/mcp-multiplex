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
   * Custom parser to extract input from the framework's request before schema validation.
   * If omitted, input is the query string, then the JSON body, then the path parameters (later wins).
   */
  parseInput?: (req: any) => unknown | Promise<unknown>;
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
  /** Input validation schema (Zod 4 schema) */
  input: z.ZodType<TInput, any>;
  /** Pure business logic handler */
  handler: (ctx: TContext, input: TInput) => Promise<TOutput> | TOutput;
  /** Context resolver for this action; overrides the adapter's or `registerMcpTools`' default resolver */
  context?: ContextResolver<any, TContext>;
  /** Optional HTTP endpoint configuration */
  http?: ActionHttpOptions;
  /** Domain error mapper */
  mapError?: (err: unknown) => CapabilityError | undefined;
  /** `false` keeps the action out of MCP tools (human-only routes such as billing or admin) */
  mcp?: boolean;
  /** Excludes the action from MCP tools, recording why (same effect as `mcp: false`) */
  mcpExcluded?: string;
  /** Alias of `mcp`: `agent: false` excludes the action from MCP tools */
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
  /** Whether this tool represents a single direct 1:1 action rather than a multiplexed group */
  isDirect?: boolean;
}

/**
 * Any valid input to MCP tool preparation or registration:
 * a prepared tool, a tool group, or a standalone action.
 */
export type McpToolInput = PreparedMcpTool | ToolGroupDefinition | ActionDefinition;

/**
 * Options for auto-grouping flat actions by their capability effect.
 */
export interface AutoGroupOptions {
  /** Custom name map for effect groups (default: { read: 'read_tools', write: 'manage_tools', destructive: 'delete_tools' }) */
  names?: Partial<Record<CapabilityEffect, string>>;
  /** Custom display titles */
  titles?: Partial<Record<CapabilityEffect, string>>;
  /** Custom summaries */
  summaries?: Partial<Record<CapabilityEffect, string>>;
}

/**
 * CORS options for HTTP and MCP handlers.
 */
export interface CorsOptions {
  origin?: string | string[];
  methods?: string[];
  headers?: string[];
  maxAge?: number;
  credentials?: boolean;
}

/**
 * A scoped multiplex instance bound to a specific execution context type.
 */
export interface MultiplexInstance<TContext> {
  action: <TInput = any, TOutput = any>(
    definition: ActionDefinition<TContext, TInput, TOutput>,
  ) => ActionDefinition<TContext, TInput, TOutput>;
  group: (definition: ToolGroupDefinition) => ToolGroupDefinition;
  toolGroup: (definition: ToolGroupDefinition) => ToolGroupDefinition;
}

export type ExecutionResult<T> = { ok: true; data: T } | { ok: false; error: CapabilityError };
