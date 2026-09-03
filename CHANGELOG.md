# mcp-multiplex

## 0.0.2

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
