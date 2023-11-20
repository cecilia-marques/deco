import { cyan, gray, green, red, yellow } from "std/fmt/colors.ts";
import { ValueType } from "../deps.ts";
import { tracer } from "../observability/otel/config.ts";
import { meter } from "../observability/otel/metrics.ts";
import { caches } from "../runtime/caches/denoKV.ts";
import { logger } from "../runtime/fetch/fetchLog.ts";
import { FnContext } from "deco/blocks/utils.tsx";
import { FieldResolver } from "deco/engine/core/resolver.ts";

const DISABLE_LOADER_CACHE = "DISABLE_LOADER_CACHE";

const int = {
  unit: "1",
  valueType: ValueType.INT,
};
const stats = {
  hit: meter.createCounter("loader_cache_hit", int),
  miss: meter.createCounter("loader_cache_miss", int),
  stale: meter.createCounter("loader_cache_stale", int),
  bypass: meter.createCounter("loader_cache_bypass", int),
};

let maybeCache: Promise<unknown> | Cache | undefined = caches.open("loader")
  .then((c) => maybeCache = c)
  .catch(() => maybeCache = undefined);

const MAX_AGE_S = 30 * 60; // 30min in seconds

type LoaderDefinition<
  TContext extends FnContext,
  TProps,
  TReturn,
  TRequest = void,
> = {
  cache: "no-store" | "stale-while-revalidate";
  propsFromRequest?: (req: Request, ctx: TContext) => TRequest;
  handler: (
    sProps: TProps,
    rProps: TRequest,
    ctx: TContext,
  ) => Promise<TReturn>;
};

const isCache = (c: any): c is Cache => typeof c?.put === "function";

const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

const resolverFromChain = (chain: FieldResolver[]) =>
  chain.at(-2)?.type === "resolvable"
    ? chain.at(-2)?.value?.toString() ?? "unknown"
    : chain.at(-1)?.value?.toString() ?? "unknown";

export const defineLoader =
  <TContext extends FnContext, TProps, TReturn, PRequest>({
    propsFromRequest,
    handler,
    cache: mode,
  }: LoaderDefinition<TContext, TProps, TReturn, PRequest>) =>
  async (
    props: Parameters<typeof handler>[0],
    req: Request,
    ctx: TContext,
  ): Promise<ReturnType<typeof handler>> => {
    const start = logger && performance.now();
    const requestProps = propsFromRequest?.(req, ctx);
    const skipCache = mode === "no-store" ||
      Deno.env.get(DISABLE_LOADER_CACHE) !== undefined ||
      !isCache(maybeCache);

    const span = tracer.startSpan("run-loader", { attributes: { mode } });
    let status: "bypass" | "miss" | "stale" | "hit" | undefined;

    try {
      if (skipCache) {
        status = "bypass";
        stats.bypass.add(1);

        return await handler(props, requestProps as PRequest & undefined, ctx);
      }

      // Somehow typescript does not understand maybeCache is Cache
      const cache = maybeCache as Cache;

      // TODO: Resolve props cache key statically
      const request = new Request(
        new URL(
          `?props=${JSON.stringify(props)}&request=${
            JSON.stringify(requestProps)
          }`,
          "https://localhost",
        ),
      );

      const callHandlerAndCache = async () => {
        const json = await handler(
          props,
          requestProps as PRequest & undefined,
          ctx,
        );

        cache.put(
          request,
          new Response(JSON.stringify(json), {
            headers: {
              "expires": new Date(Date.now() + (MAX_AGE_S * 1e3)).toUTCString(),
            },
          }),
        ).catch(console.error);

        return json;
      };

      const matched = await cache.match(request).catch(() => null);

      if (!matched) {
        status = "miss";
        stats.miss.add(1);

        return await callHandlerAndCache();
      }

      const expires = matched.headers.get("expires");
      const isStale = expires ? !inFuture(expires) : false;

      if (isStale) {
        status = "stale";
        stats.stale.add(1);

        callHandlerAndCache().catch((error) => console.error(error));
      } else {
        status = "hit";
        stats.hit.add(1);
      }

      return await matched.json();
    } finally {
      if (logger) {
        const s = status?.toUpperCase();
        const d = performance.now() - start!;
        const resolver = cyan(resolverFromChain(ctx.resolveChain));
        const p = Deno.inspect(JSON.stringify(props), { colors: false });
        const propsStr = gray(p.length > 80 ? `${p.slice(0, 80)}...` : p);
        const latency = (d < 300 ? green : d < 700 ? yellow : red)(
          d > 1e3 ? `${(d / 1e3).toFixed(2)}s` : `${d.toFixed(0)}ms`,
        );

        logger(
          ` -> ${s} ${latency} ${resolver} ${propsStr} `,
        );
      }

      span.addEvent("cache", { status });
      span.end();
    }
  };
