// Framework-free core. Adapters are separate entry points so that importing the core never loads
// an optional peer: mcp-multiplex/express, /fastify, /fetch, /hono and /next.
export * from "./core/action.js";
export * from "./core/dispatcher.js";
export * from "./core/group.js";
export * from "./core/http.js";
export * from "./core/mcp.js";
export * from "./core/schema.js";
export * from "./core/types.js";
