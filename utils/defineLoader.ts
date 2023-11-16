import { caches, timings } from "../runtime/caches/denoKV.ts";

let cache: Cache | undefined | Promise<Cache>;
const getCache = () => {
  cache ||= caches.open("loader");

  return cache;
};

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

  if (mode === "no-store") {
    return handler(props, requestProps, ctx);
  }

  const request = new Request(
    new URL(
      `?key=${JSON.stringify({ props, requestProps })}`,
      "https://localhost",
    ),
  );

  let end = timings("await getCache();");
  const cache = await getCache();
  end();
  end = timings("cache.match(request);");
  const matched = await cache.match(request);
  end();

  if (matched) {
    end = timings("matched.json();");
    const json = await matched.json();
    end();

    return json
  }

  const promise = handler(props, requestProps, ctx).then((json) => {
    cache
      .put(request, new Response(JSON.stringify(json)))
      .catch(console.error);

    return json;
  });

  return promise;
  // return matched ? matched.json() : promise;
};
