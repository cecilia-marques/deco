import { caches } from "../runtime/caches/denoKV.ts";

let maybeCache: Promise<unknown> | Cache | undefined = caches.open("loader")
  .then((c) => maybeCache = c)
  .catch(() => maybeCache = undefined);

const MAX_AGE_S = 10; // 30 * 60; // 30min in seconds

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

  if (skipCache) {
    return handler(props, requestProps, ctx);
  }

  // Somehow typescript does not understand maybeCache is Cache
  const cache = maybeCache as Cache;

  const request = new Request(
    new URL(
      `?props=${JSON.stringify(props)}&request=${JSON.stringify(requestProps)}`,
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
    return callHandlerAndCache();
  }

  const expires = matched.headers.get("expires");
  const isStale = expires ? !inFuture(expires) : false;

  if (isStale) {
    callHandlerAndCache().catch(console.error);
  }

  return matched.json();
};
