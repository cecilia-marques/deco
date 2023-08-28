import { ConnInfo } from "std/http/server.ts";
import { Page } from "../blocks/page.ts";
import Fresh from "../handlers/fresh.ts";
import { context } from "../live.ts";
import { pageIdFromMetadata } from "../pages/LivePage.tsx";
import { adminUrlFor, isAdmin } from "../utils/admin.ts";

export interface DevConfig {
  page: Page;
}

/**
 * @title Private Fresh Page
 * @description Useful for pages under development.
 */
export default function DevPage(devConfig: DevConfig) {
  const freshHandler = Fresh(devConfig);
  return (req: Request, ctx: ConnInfo) => {
    const referer = req.headers.get("origin") ?? req.headers.get("referer");
    const isOnAdmin = referer && isAdmin(referer);
    const pageId = pageIdFromMetadata(devConfig.page.metadata);

    if (
      context.isDeploy
    ) {
      if (!referer || !isOnAdmin) {
        if (pageId === -1) {
          return Response.error();
        }
        // redirect
        return Response.redirect(
          adminUrlFor(pageId, context.siteId),
        );
      }
    }
    return freshHandler(req, ctx);
  };
}