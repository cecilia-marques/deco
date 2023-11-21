import { FnContext } from "deco/blocks/utils.tsx";
import { cyan, gray, green, red, yellow } from "std/fmt/colors.ts";
import { ValueType } from "../deps.ts";
import { meter } from "../observability/otel/metrics.ts";
import { caches } from "../runtime/caches/denoKV.ts";
import { logger } from "../runtime/fetch/fetchLog.ts";

const DISABLE_LOADER_CACHE = "DISABLE_LOADER_CACHE";

const stats = {
  cache: meter.createCounter("loader_cache", {
    unit: "1",
    valueType: ValueType.INT,
  }),
  latency: meter.createHistogram("resolver_latency", {
    description: "resolver latency",
    unit: "ms",
    valueType: ValueType.DOUBLE,
  }),
};

let maybeCache: Promise<unknown> | Cache | undefined = caches.open("loader")
  .then((c) => maybeCache = c)
  .catch(() => maybeCache = undefined);

const MAX_AGE_S = 30 * 60; // 30min in seconds

type LoaderDefinition<
  TContext,
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

export const defineLoader =
  <TContext extends FnContext<unknown, any>, TProps, TReturn, PRequest>({
    propsFromRequest,
    handler,
    cache: mode,
  }: LoaderDefinition<TContext, TProps, TReturn, PRequest>) =>
  async (
    props: Parameters<typeof handler>[0],
    req: Request,
    ctx: TContext,
  ): Promise<ReturnType<typeof handler>> => {
    const loader = ctx.resolverId;
    const start = performance.now();
    const requestProps = propsFromRequest?.(req, ctx);
    const skipCache = mode === "no-store" ||
      Deno.env.get(DISABLE_LOADER_CACHE) !== undefined ||
      !isCache(maybeCache);

    const end = ctx.monitoring?.timings.start(loader);
    let status: "bypass" | "miss" | "stale" | "hit" | undefined;

    try {
      if (skipCache) {
        status = "bypass";
        stats.cache.add(1, { status, loader });

        return await handler(props, requestProps as PRequest & undefined, ctx);
      }

      // Somehow typescript does not understand maybeCache is Cache
      const cache = maybeCache as Cache;

      // TODO: Resolve props cache key statically
      const url = new URL("https://localhost");
      url.searchParams.set("loader", loader);
      url.searchParams.set("request", JSON.stringify(requestProps));
      const request = new Request(url);

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
        stats.cache.add(1, { status, loader });

        return await callHandlerAndCache();
      }

      const expires = matched.headers.get("expires");
      const isStale = expires ? !inFuture(expires) : false;

      if (isStale) {
        status = "stale";
        stats.cache.add(1, { status, loader });

        callHandlerAndCache().catch((error) => console.error(error));
      } else {
        status = "hit";
        stats.cache.add(1, { status, loader });
      }

      return await matched.json();
    } finally {
      if (logger) {
        const s = status?.toUpperCase();
        const d = performance.now() - start!;
        const resolver = cyan(loader);
        const propsStr = gray(JSON.stringify({ props, requestProps }));
        const latency = (d < 300 ? green : d < 700 ? yellow : red)(
          d > 1e3 ? `${(d / 1e3).toFixed(2)}s` : `${d.toFixed(0)}ms`,
        );

        logger(` -> ${s} ${latency} ${resolver} ${propsStr}`);
      }

      const dimension = { loader, status };
      stats.latency.record(performance.now() - start, dimension);
      end?.(status);
    }
  };
