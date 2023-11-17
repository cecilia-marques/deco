import { caches } from "../runtime/caches/denoKV.ts";
import { tracer } from "../observability/otel/config.ts";
import { meter } from "../observability/otel/metrics.ts";
import { ValueType } from "../deps.ts";

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

interface LoaderDefinition<
  TContext,
  TProps,
  TReturn,
  TRequest = void,
> {
  cache: "no-store" | "stale-while-revalidate";
  propsFromRequest: (req: Request) => TRequest;
  handler: (
    sProps: TProps,
    rProps: TRequest,
    ctx: TContext,
  ) => Promise<TReturn>;
}

const isCache = (c: any): c is Cache => typeof c?.put === "function";

const inFuture = (maybeDate: string) => {
  try {
    return new Date(maybeDate) > new Date();
  } catch {
    return false;
  }
};

export const defineLoader = <TContext, TProps, TReturn, PRequest>({
  propsFromRequest,
  handler,
  cache: mode,
}: LoaderDefinition<TProps, TContext, TReturn, PRequest>) =>
async (
  props: Parameters<typeof handler>[0],
  req: Request,
  ctx: Parameters<typeof handler>[2],
): Promise<ReturnType<typeof handler>> => {
  const requestProps = propsFromRequest(req);
  const skipCache = mode === "no-store" || !isCache(maybeCache);

  const span = tracer.startSpan("run-loader", { attributes: { mode } });
  let status;

  try {
    if (skipCache) {
      status = "bypass";
      stats.bypass.add(1);

      return await handler(props, requestProps, ctx);
    }

    // Somehow typescript does not understand maybeCache is Cache
    const cache = maybeCache as Cache;

    const request = new Request(
      new URL(
        `?props=${JSON.stringify(props)}&request=${
          JSON.stringify(requestProps)
        }`,
        "https://localhost",
      ),
    );

    const callHandlerAndCache = async () => {
      const json = await handler(props, requestProps, ctx);

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
    console.log({ status });
    span.addEvent("cache", { status });
    span.end();
  }
};
