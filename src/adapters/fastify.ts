import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { executeAction } from "../core/dispatcher.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface FastifyAdapterOptions {
  actions: ActionDefinition[];
  /** Prefix for all mounted action routes (e.g. '/api') */
  prefix?: string;
  /** Extract user session from FastifyRequest. Defaults to (req as any).user */
  getUser?: (req: FastifyRequest) => any;
  /** Default fallback context resolver */
  contextResolver?: ContextResolver;
}

/**
 * Fastify plugin to register action HTTP routes onto a Fastify instance.
 */
export const fastifyMultiplex: FastifyPluginAsync<FastifyAdapterOptions> = async (
  fastify: FastifyInstance,
  options: FastifyAdapterOptions,
) => {
  const getUser = options.getUser || ((req: FastifyRequest) => (req as any).user);
  const httpActions = options.actions.filter((a) => a.http);

  for (const action of httpActions) {
    const http = action.http!;
    const method = http.method.toUpperCase() as any;

    fastify.route({
      method,
      url: http.path,
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        let rawInput: unknown;

        if (http.parseInput) {
          rawInput = await http.parseInput(request);
        } else {
          const query = (request.query as any) || {};
          const params = (request.params as any) || {};
          const body = (request.body as any) || {};
          rawInput = { ...query, ...params, ...(typeof body === "object" && body !== null ? body : {}) };
        }

        const user = getUser(request);
        const result = await executeAction(action, rawInput, user, options.contextResolver);

        if (!result.ok) {
          reply.status(result.error.status).send({
            error: result.error.code,
            message: result.error.message,
            details: result.error.details,
          });
          return;
        }

        reply.status(200).send(result.data);
      },
    });
  }
};

/**
 * Helper to create a Fastify plugin instance.
 */
export function createFastifyPlugin(
  actions: ActionDefinition[],
  options: Omit<FastifyAdapterOptions, "actions"> = {},
): FastifyPluginAsync {
  return async (fastify: FastifyInstance) => {
    await fastify.register(fastifyMultiplex, { ...options, actions });
  };
}
