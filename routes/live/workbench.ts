import { Resolvable } from "$live/engine/core/resolver.ts";
import { context } from "$live/live.ts";
import { toManifestBlocks } from "$live/routes/live/_meta.ts";
import { Node } from "$live/types.ts";
import { resolveFilePath } from "$live/utils/filesystem.ts";
import { basename } from "std/path/mod.ts";

const capitalize = (str: string) => str[0].toUpperCase() + str.substring(1);
const createDataPageFor = (component: string) =>
  btoa(JSON.stringify({
    "name": component,
    "state": "global",
    "path": `/_live/workbench/sections/${component}`,
    "data": {
      "sections": [{
        "key": component,
        "label": component,
        "uniqueId": component,
        "props": {},
      }],
      "functions": [],
    },
  }));
const mapSectionToNode =
  (configs: Record<string, Resolvable>) => (component: string) => {
    let href: string | undefined = undefined;
    if (component.includes("global.tsx")) { // global settings
      const pageFind = Object.entries(configs).find(([_, value]) =>
        (value as { name: string })?.name === component
      );

      href = pageFind
        ? `/admin/${context.siteId}/pages/${pageFind[0]}`
        : `/api/${context.siteId}/pages/new?redirect=true&data=${
          createDataPageFor(component)
        }`;
    } else {
      href = `/admin/sites/${context.siteId}/blocks/previews?ref=${
        encodeURIComponent("#/definitions/" + btoa(component))
      }`;
    }
    return {
      label: capitalize(basename(component)),
      fullPath: component,
      href,
      editLink: context.deploymentId === undefined // only allow vscode when developing locally
        ? `vscode://file/${resolveFilePath(component)}`
        : undefined,
    };
  };
const isTSXFile = (section: string) => section.endsWith(".tsx");

export const isGlobalSection = (section: string) =>
  section.endsWith(".global.tsx");

export const getWorkbenchTree = (state: Record<string, Resolvable>): Node[] => {
  const { blocks: { sections: _ignore, ...rest } } = toManifestBlocks(
    context.manifest!,
  );

  const nodes: Node[] = [];

  for (const [block, blockValues] of Object.entries(rest)) {
    nodes.push({
      label: capitalize(basename(block)),
      fullPath: block,
      children: Object.keys(blockValues).map(mapSectionToNode(state)),
    });
  }
  const sections = context.manifest?.sections ?? {};

  const tsxFileSections = Object
    .keys(sections)
    .filter((section) => isTSXFile(section));

  const firstLevelNonGlobalSectionNodes: Node[] = tsxFileSections.filter((
    section,
  ) => !isGlobalSection(section)).map(mapSectionToNode(state));

  const firstLevelGlobalSectionNodes: Node[] = tsxFileSections.filter(
    isGlobalSection,
  ).map(mapSectionToNode(state));

  return [{
    label: "sections",
    fullPath: "./sections",
    children: firstLevelNonGlobalSectionNodes,
  }, {
    label: "globals",
    fullPath: "./sections",
    children: firstLevelGlobalSectionNodes,
  }, ...nodes];
};

export const handler = async (req: Request) => {
  const state = await context.configStore!.state();

  return new Response(JSON.stringify(getWorkbenchTree(state)), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, *",
    },
  });
};