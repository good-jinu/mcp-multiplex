import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, HTTPMethods } from "fastify";
import { executeAction } from "../core/dispatcher.js";
import { httpErrorBody, mergeHttpInput } from "../core/http.js";
import type { ActionDefinition, ContextResolver } from "../core/types.js";

export interface FastifyAdapterOptions {
  actions: ActionDefinition[];
  /** Prefix for all mounted action routes (e.g. '/api') */
  prefix?: string;
  /** Extract context from FastifyRequest. Defaults to (req as any).user */
  getContext?: (req: FastifyRequest) => any;
  /** Extract user session from FastifyRequest (alias of getContext). Defaults to (req as any).user */
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
  const getCtx = options.getContext || options.getUser || ((req: FastifyRequest) => (req as any).user);

  for (const action of options.actions.filter((a) => a.http)) {
    const http = action.http!;

    fastify.route({
      method: http.method.toUpperCase() as HTTPMethods,
      url: http.path,
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        const rawInput = http.parseInput
          ? await http.parseInput(request)
          : mergeHttpInput(request.query, request.body, request.params);
        const result = await executeAction(action, rawInput, await getCtx(request), options.contextResolver);
        if (result.ok) {
          return reply.status(200).send(result.data);
        }
        return reply.status(result.error.status).send(httpErrorBody(result.error));
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
