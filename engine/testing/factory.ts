import { UnionToIntersection } from "deco/deps.ts";
import { AppManifest } from "../../blocks/app.ts";
import { ReleaseResolver } from "../../engine/core/mod.ts";
import {
  BaseContext,
  Resolver,
  ResolverMap
} from "../../engine/core/resolver.ts";
import { Release } from "../../engine/releases/provider.ts";
import { BlockModule, ResolverLike } from "../block.ts";
import { buildResolver } from "../manifest/manifest.ts";
import { InMemoryRelease } from "./inmemory.ts";
export interface Options {
  release?: Release;
}

export type ResolverMapFrom<TManifest extends AppManifest> = UnionToIntersection<
  {
    [key in (keyof TManifest)]: {
      [blockKey in keyof TManifest[key]]: TManifest[key][blockKey] extends
        BlockModule<infer TResolverLike>
        ? TResolverLike extends ResolverLike<infer Return, infer TArgs>
          ? Resolver<Return, TArgs[0]>
        : Resolver<unknown>
        : Resolver<unknown>;
    };
  }[(keyof TManifest)]
>;

export const createResolver = <
  TAppManifest extends AppManifest = AppManifest,
  TResolverMap extends ResolverMapFrom<TAppManifest> extends ResolverMap
    ? ResolverMapFrom<TAppManifest>
    : ResolverMap = ResolverMapFrom<TAppManifest> extends ResolverMap
      ? ResolverMapFrom<TAppManifest>
      : ResolverMap,
  TContext extends BaseContext<TResolverMap> = BaseContext<
    TResolverMap
  >,
>(
  manifest: TAppManifest,
  options?: Options,
): ReleaseResolver<TContext> => {
  const [resolver, _] = buildResolver<TAppManifest, TContext>(
    manifest,
    options?.release ?? new InMemoryRelease(),
  );
  return resolver;
};
