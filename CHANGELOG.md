# mcp-multiplex

## 0.1.0

### Minor Changes

- [#5](https://github.com/good-jinu/mcp-multiplex/pull/5) [`f108b79`](https://github.com/good-jinu/mcp-multiplex/commit/f108b796e9ae40bd2f0df71169d8538c4ee8895e) Thanks [@good-jinu](https://github.com/good-jinu)! - The package root no longer loads framework adapters, so `import "mcp-multiplex"` works with only `zod` installed (it used to fail with "Cannot find package 'express'").
  
  **Breaking**
  - Import adapters from their entry points: `mcp-multiplex/express`, `/fastify`, `/fetch`, `/hono` and `/next`. The root now exports only the core.
  - `zod` is a peer dependency and must be v4, which the MCP SDK v2 and the JSON-schema features already required.
  - With the default input parsing, path parameters now take precedence over body fields.
  
  **Fixes**
  - Effect and duplicate-name checks also run on plain-object tool groups passed to `prepareMcpTools`/`registerMcpTools`, not only on groups made with `defineToolGroup`. Duplicate tool and action names are rejected.
  - `annotationOverrides.openWorldHint` is respected.
  - `registerMcpTools` accepts `{ contextResolver }`, and `createNextHandler` passes its `contextResolver` to the MCP tools, so actions resolve the same context over MCP as over HTTP.
  - The Express adapter awaits an async `parseInput` and forwards unexpected errors to `next()`.
  - The fetch/Next and Hono adapters answer `400 invalid_json` to malformed JSON bodies instead of treating them as empty. Fetch/Next also match `basePath` by whole path segments and no longer crash on malformed percent-encoding.
  - Errors are passed through only when `status` is a number and `code` and `message` are strings.
  
  **Improvements**
  - Validation messages name the failing field (`title: Required`), and MCP validation errors include the action's expected JSON schema.
  - `createNextHandler` compiles tool groups once at startup instead of on every MCP request.
  - Shared HTTP helpers (`mergeHttpInput`, `httpErrorBody`, `parseJsonBody`) are exported for custom adapters.
  - `"sideEffects": false` for better tree-shaking.

### Patch Changes

- [#3](https://github.com/good-jinu/mcp-multiplex/pull/3) [`d300ade`](https://github.com/good-jinu/mcp-multiplex/commit/d300ade9c91b1cf020c48c7c3cc3546e84756011) Thanks [@good-jinu](https://github.com/good-jinu)! - Replace 'any' return type of ExpressAdapterOptions.getUser with 'unknown' for improved type safety.

- [#4](https://github.com/good-jinu/mcp-multiplex/pull/4) [`0279122`](https://github.com/good-jinu/mcp-multiplex/commit/0279122bc471ec04b28c0629ae52f3a9769ea5b4) Thanks [@good-jinu](https://github.com/good-jinu)! - Improve `registerMcpTools` typing with `McpServerLike` interface.

## 0.0.1

### Patch Changes

- [`b4f7798`](https://github.com/good-jinu/mcp-multiplex/commit/b4f77984aa502bbe38cc041e0f4a85cec0261f82) Thanks [@good-jinu](https://github.com/good-jinu)! - Initial release of `mcp-multiplex`:
  - Effect-grouped action multiplexing (`read`, `write`, `destructive`) for Model Context Protocol (MCP SDK v2)
  - Multi-framework HTTP adapters: Hono, Next.js (App Router), Fastify, Express, and Web Standard Fetch
  - Declarative AI safety boundaries (`mcp: false` / `mcpExcluded`)
  - Progressive schema offloading to keep LLM context windows lightweight
