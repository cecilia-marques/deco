// DO NOT EDIT. This file is generated by deco.
// This file SHOULD be checked into source version control.
// This file is automatically updated during development when running `dev.ts`.

import config from "./deno.json" assert { type: "json" };
import { DecoManifest } from "$live/types.ts";
import * as $$$0 from "./loaders/workflows/get.ts";
import * as $$$1 from "./loaders/workflows/events.ts";
import * as $$$$0 from "./routes/_middleware.ts";
import * as $$$$1 from "./routes/live/inspect/[...block].ts";
import * as $$$$2 from "./routes/live/invoke/[...key].ts";
import * as $$$$3 from "./routes/live/invoke/index.ts";
import * as $$$$4 from "./routes/live/editorData.ts";
import * as $$$$5 from "./routes/live/workbench.ts";
import * as $$$$6 from "./routes/live/previews/[...block].tsx";
import * as $$$$7 from "./routes/live/release.ts";
import * as $$$$8 from "./routes/live/_meta.ts";
import * as $$$$9 from "./routes/[...catchall].tsx";
import * as $$$$$$0 from "./handlers/routesSelection.ts";
import * as $$$$$$1 from "./handlers/router.ts";
import * as $$$$$$2 from "./handlers/devPage.ts";
import * as $$$$$$3 from "./handlers/proxy.ts";
import * as $$$$$$4 from "./handlers/fresh.ts";
import * as $$$$$$5 from "./handlers/redirect.ts";
import * as $$$$$$6 from "./handlers/workflowRunner.ts";
import * as $$$$$$$0 from "./pages/LivePage.tsx";
import * as $$$$$$$$0 from "./sections/UseSlot.tsx";
import * as $$$$$$$$1 from "./sections/Slot.tsx";
import * as $$$$$$$$2 from "./sections/PageInclude.tsx";
import * as $$$$$$$$$0 from "./matchers/MatchDate.ts";
import * as $$$$$$$$$1 from "./matchers/MatchUserAgent.ts";
import * as $$$$$$$$$2 from "./matchers/MatchSite.ts";
import * as $$$$$$$$$3 from "./matchers/MatchHost.ts";
import * as $$$$$$$$$4 from "./matchers/MatchMulti.ts";
import * as $$$$$$$$$5 from "./matchers/MatchRandom.ts";
import * as $$$$$$$$$6 from "./matchers/MatchDevice.ts";
import * as $$$$$$$$$7 from "./matchers/MatchEnvironment.ts";
import * as $$$$$$$$$8 from "./matchers/MatchAlways.ts";
import * as $$$$$$$$$$0 from "./flags/audience.ts";
import * as $$$$$$$$$$1 from "./flags/everyone.ts";
import * as $$$$$$$$$$$0 from "./actions/workflows/start.ts";
import * as $$$$$$$$$$$1 from "./actions/workflows/cancel.ts";
import * as $$$$$$$$$$$2 from "./actions/workflows/signal.ts";
import * as $$$$$$$$$$$3 from "./actions/workflows/run.ts";
import * as $live_catchall from "$live/routes/[...catchall].tsx";

const manifest = {
  "loaders": {
    "$live/loaders/workflows/events.ts": $$$1,
    "$live/loaders/workflows/get.ts": $$$0,
  },
  "routes": {
    "./routes/_middleware.ts": $$$$0,
    "./routes/[...catchall].tsx": $$$$9,
    "./routes/index.tsx": $live_catchall,
    "./routes/live/_meta.ts": $$$$8,
    "./routes/live/editorData.ts": $$$$4,
    "./routes/live/inspect/[...block].ts": $$$$1,
    "./routes/live/invoke/[...key].ts": $$$$2,
    "./routes/live/invoke/index.ts": $$$$3,
    "./routes/live/previews/[...block].tsx": $$$$6,
    "./routes/live/release.ts": $$$$7,
    "./routes/live/workbench.ts": $$$$5,
  },
  "handlers": {
    "$live/handlers/devPage.ts": $$$$$$2,
    "$live/handlers/fresh.ts": $$$$$$4,
    "$live/handlers/proxy.ts": $$$$$$3,
    "$live/handlers/redirect.ts": $$$$$$5,
    "$live/handlers/router.ts": $$$$$$1,
    "$live/handlers/routesSelection.ts": $$$$$$0,
    "$live/handlers/workflowRunner.ts": $$$$$$6,
  },
  "pages": {
    "$live/pages/LivePage.tsx": $$$$$$$0,
  },
  "sections": {
    "$live/sections/PageInclude.tsx": $$$$$$$$2,
    "$live/sections/Slot.tsx": $$$$$$$$1,
    "$live/sections/UseSlot.tsx": $$$$$$$$0,
  },
  "matchers": {
    "$live/matchers/MatchAlways.ts": $$$$$$$$$8,
    "$live/matchers/MatchDate.ts": $$$$$$$$$0,
    "$live/matchers/MatchDevice.ts": $$$$$$$$$6,
    "$live/matchers/MatchEnvironment.ts": $$$$$$$$$7,
    "$live/matchers/MatchHost.ts": $$$$$$$$$3,
    "$live/matchers/MatchMulti.ts": $$$$$$$$$4,
    "$live/matchers/MatchRandom.ts": $$$$$$$$$5,
    "$live/matchers/MatchSite.ts": $$$$$$$$$2,
    "$live/matchers/MatchUserAgent.ts": $$$$$$$$$1,
  },
  "flags": {
    "$live/flags/audience.ts": $$$$$$$$$$0,
    "$live/flags/everyone.ts": $$$$$$$$$$1,
  },
  "actions": {
    "$live/actions/workflows/cancel.ts": $$$$$$$$$$$1,
    "$live/actions/workflows/run.ts": $$$$$$$$$$$3,
    "$live/actions/workflows/signal.ts": $$$$$$$$$$$2,
    "$live/actions/workflows/start.ts": $$$$$$$$$$$0,
  },
  "islands": {},
  "config": config,
  "baseUrl": import.meta.url,
};

export type Manifest = typeof manifest;

export default manifest satisfies DecoManifest;
