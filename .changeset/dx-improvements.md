---
"mcp-multiplex": minor
---

Developer experience improvements:
- Added `initMultiplex<TContext>()` builder factory for automatic type inference of `ctx` across actions without per-action type annotations.
- Added direct 1:1 action tools to `registerMcpTools` and `prepareMcpTools` so actions can be exposed directly without `{ action, args }` nesting when grouped multiplexing is not needed.
- Added `autoGroupActions(actions)` to automatically group flat actions by capability effect (`read_tools`, `manage_tools`, `delete_tools`).
- Added `createMcpHandler` in `mcp-multiplex/next` for dedicated Next.js App Router MCP routes with automatic CORS preflight handling and response headers.
- Made `actions` optional in `createNextHandler` when `toolGroups` or `tools` is provided (auto-extracts actions for REST).
- Added trailing slash normalization (`/api/mcp/` and `/api/mcp`).
- Added `getContext` as a clear alias for `getUser` across all adapters.
