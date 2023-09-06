// deno-lint-ignore-file no-explicit-any
import blocks from "../../blocks/index.ts";
import { HandlerContext } from "../../deps.ts";
import { ReleaseResolver } from "../../engine/core/mod.ts";
import {
  BaseContext,
  DanglingReference,
  Resolvable,
  Resolver,
  ResolverMap,
} from "../../engine/core/resolver.ts";
import { PromiseOrValue } from "../../engine/core/utils.ts";
import { integrityCheck } from "../../engine/integrity.ts";
import defaultResolvers from "../../engine/manifest/defaults.ts";
import {
  getComposedConfigStore,
  Release,
} from "../../engine/releases/provider.ts";
import { context } from "../../live.ts";
import { LiveConfig } from "../../types.ts";

import { parse } from "std/flags/mod.ts";
import { AppManifest } from "../../blocks/app.ts";
import { buildRuntime } from "../../blocks/appsUtil.ts";
import { SiteInfo } from "../../types.ts";
const shouldCheckIntegrity = parse(Deno.args)["check"] === true;

const ENV_SITE_NAME = "DECO_SITE_NAME";

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response,
> = (
  request: Request,
  ctx: HandlerContext<TData, LiveConfig<TState, TConfig>>,
) => PromiseOrValue<Resp>;

export interface FreshContext<Data = any, State = any, TConfig = any>
  extends BaseContext {
  context: HandlerContext<Data, LiveConfig<State, TConfig>>;
  request: Request;
}

export type LiveState<T, TState = unknown> = TState & {
  $live: T;
};

export interface DanglingRecover {
  recoverable: (type: string) => boolean;
  recover: Resolver;
}

export const buildDanglingRecover = (recovers: DanglingRecover[]): Resolver => {
  return (parent, ctx) => {
    const curr = ctx.resolveChain.findLast((r) => r.type === "dangling")?.value;

    if (typeof curr !== "string") {
      throw new Error(`Resolver not found ${JSON.stringify(ctx.resolveChain)}`);
    }

    for (const { recoverable, recover } of recovers) {
      if (recoverable(curr)) {
        return recover(parent, ctx);
      }
    }
    throw new DanglingReference(curr);
  };
};

const siteName = (): string | undefined => {
  const siteNameFromEnv = Deno.env.get(ENV_SITE_NAME);
  if (siteNameFromEnv) {
    return siteNameFromEnv;
  }
  if (!context.namespace) {
    return undefined;
  }
  const [_, siteName] = context.namespace!.split("/"); // deco-sites/std best effort
  return siteName ?? context.namespace!;
};

export const buildResolver = <
  T extends AppManifest,
  TContext extends BaseContext,
>(
  manifest: T,
  release: Release,
): [ReleaseResolver<TContext>, T] => {
  const [newManifest, resolvers, recovers] = (blocks() ?? []).reduce(
    (curr, acc) => buildRuntime<T, TContext>(curr, acc),
    [manifest, {}, []] as [T, ResolverMap<TContext>, DanglingRecover[]],
  );
  return [
    new ReleaseResolver<TContext>({
      resolvers: { ...resolvers, ...defaultResolvers },
      release,
      danglingRecover: recovers.length > 0
        ? buildDanglingRecover(recovers)
        : undefined,
    }),
    newManifest,
  ];
};
export const $live = <T extends AppManifest>(
  m: T,
  siteInfo?: SiteInfo,
  useLocalStorageOnly = false,
): T => {
  context.siteId = siteInfo?.siteId ?? -1;
  context.namespace = siteInfo?.namespace;
  const currentSite = siteName();
  if (!currentSite) {
    throw new Error(
      `site is not identified, use variable ${ENV_SITE_NAME} to define it`,
    );
  }
  context.namespace ??= `deco-sites/${currentSite}`;
  context.site = currentSite;
  const provider = getComposedConfigStore(
    context.namespace!,
    context.site,
    context.siteId,
    useLocalStorageOnly,
  );
  context.release = provider;
  const [resolver, newManifest] = buildResolver(m, provider);

  if (shouldCheckIntegrity) {
    provider.state().then(
      (resolvables: Record<string, Resolvable>) => {
        integrityCheck(resolver.getResolvers(), resolvables);
      },
    );
  }
  // should be set first
  context.releaseResolver = resolver;
  context.manifest = newManifest;
  console.log(
    `Starting live: siteId=${context.siteId} site=${context.site}`,
  );

  return context.manifest as T;
};
