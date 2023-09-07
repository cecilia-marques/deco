import { createResolver } from "./factory.ts";
import manifest, {Manifest} from "../../live.gen.ts";
import { Page } from "../../blocks/page.ts";
import { renderToString } from "preact-render-to-string";
import { ResolvesTo, Resolvable, BaseContext } from '../core/resolver.ts';
import {ResolverMapFrom} from "./factory.ts";

type SSS = ResolvesTo<Page, ResolverMapFrom<Manifest>>["resolveType"];
type SS = {
  __resolveType: ResolvesTo<Page, ResolverMapFrom<Manifest>>["resolveType"];
}
& {
  [
    key in keyof Omit<ResolvesTo<Page, ResolverMapFrom<Manifest>>["props"], "__resolveType">
  ]: Resolvable<
    Omit<ResolvesTo<Page, ResolverMapFrom<Manifest>>["props"], "__resolveType">[key],
    BaseContext,
    ResolverMapFrom<Manifest>
  >;
}
Deno.test("factory", async () => {
  const resolver = createResolver(manifest);
  const s: SS = {
    __resolveType: "$live/pages/LivePage.tsx"
  }
  const { Component, props } = await resolver.resolve<Page>({
    __resolveType: "$live/pages/LivePage.tsx",
  }, { request: new Request("https://localhost:8000") });

  const txt = renderToString(<Component {...props}></Component>);
  console.log({ txt });
});
