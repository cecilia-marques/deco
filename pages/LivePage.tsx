import { Page } from "$live/blocks/page.ts";
import { isSection, Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveControls from "$live/components/LiveControls.tsx";
import LivePageEditor, {
  BlockControls,
} from "$live/components/LivePageEditor.tsx";
import { PreactComponent } from "$live/engine/block.ts";
import { notUndefined } from "$live/engine/core/utils.ts";
import { context } from "$live/live.ts";
import {
  usePageContext,
  useRouterContext,
} from "$live/routes/[...catchall].tsx";
import { isLivePageProps } from "$live/sections/PageInclude.tsx";
import { CONTENT_SLOT_NAME } from "$live/sections/Slot.tsx";
import { Props as UseSlotProps } from "$live/sections/UseSlot.tsx";
import { JSX } from "preact/jsx-runtime";

export interface Props {
  name: string;
  fold?: number;
  layout?: Page;
  sections: Section[];
}

function belowTheFold() {
  const element = document.getElementById("LIVE_BELOW_THE_FOLD");
  if (!element) {
    return;
  }
  let reached = false;
  const eventListener = async () => {
    if (reached) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const isInViewPort = rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth);
    if (!isInViewPort) {
      return;
    }
    reached = true;
    const html = await fetch("/?belowTheFold").then((r) => r.text());
    removeEventListener("scroll", eventListener);

    const freshState = document.getElementById("__FRSH_STATE");
    freshState?.remove();
    const freshTwind = document.getElementById("__FRSH_TWIND");
    if (freshTwind) {
      freshTwind.id = "__FRSH_TWIND_2";
    }

    const headElement = "<head>";
    const headInit = html.indexOf(headElement);
    const head = html.substring(
      headInit + headElement.length,
      html.indexOf(
        "</head>",
      ),
    );

    const bodyLenght = "<body>";
    const findBody = html.indexOf("<body>");

    const withoutBody = html.substring(
      findBody + bodyLenght.length,
      html.indexOf("</body>"),
    );

    element.innerHTML = `${head}${withoutBody}`;
  };
  addEventListener("scroll", eventListener);
}

function renderSectionFor(editMode?: boolean) {
  const Controls = editMode ? BlockControls : () => null;
  return function _renderSection(
    { Component: Section, props, metadata }: Props["sections"][0],
    idx: number,
  ) {
    return (
      <section
        id={`${metadata?.component}-${idx}`}
        data-manifest-key={metadata?.component}
      >
        <Controls metadata={metadata} index={idx} />
        <Section {...props} />
      </section>
    );
  };
}

export const renderSection = renderSectionFor();

interface UseSlotSection {
  // useSection can be either a `UseSlotSection` or a `Section[]` that is outside a slot.
  useSection: PreactComponent<JSX.Element, UseSlotProps> | Section[];
  used: boolean;
}

const USE_SLOT_SECTION_KEY = "$live/sections/UseSlot.tsx" as const;
/**
 * Builds a map which the key is the name of the slot and the value is the slot component itself.
 * For those sections that aren't used inside a slot it is considered the default `content slot`.
 * @param sections the sections
 * @returns the implementation map.
 */
function indexedBySlotName(
  sections: Section[],
) {
  const indexed: Record<string, UseSlotSection> = {};
  const contentSections: Section[] = [];

  for (const section of sections) {
    if (isSection(section, USE_SLOT_SECTION_KEY)) {
      indexed[section.props.name] = {
        useSection: section,
        used: false,
      };
    } else {
      contentSections.push(section);
    } // others are considered content
  }
  if (contentSections.length > 0 && !indexed[CONTENT_SLOT_NAME]) {
    indexed[CONTENT_SLOT_NAME] = {
      used: false,
      useSection: contentSections,
    };
  }

  return indexed;
}

/**
 * Swaps out the `Slot` component by its implementation if available and not used.
 * @param impls the implementation map
 * @returns the section or the slot implementation if available.
 */
const useSlots = (
  impls: Record<string, UseSlotSection>,
) =>
(sec: Section): Section[] => {
  if (isSection(sec, "$live/sections/Slot.tsx")) {
    const impl = impls[sec.props.name ?? CONTENT_SLOT_NAME];
    if (impl && !impl.used) {
      impl.used = true;
      return Array.isArray(impl.useSection)
        ? impl.useSection
        : [impl.useSection]; // allow content sections to be rendered at current page level.
    }
  }
  return [sec];
};

/**
 * Recursively builds a page based on its inheritance hierarchy.
 * The algorithm does the following:
 * 0. If there are implementations available, so replace the `Slot.tsx` with the actual implementation for such slot. (useSlots function)
 * 1. If the page has inheritance so the current sections are divded into two groups:
 * 1.1 Per Slot sections: Sections that are inside a UseSlot.tsx section, which are supposed to be used inside a `Slot.tsx` section on its parent.
 * 1.2 Sections that aren't inside a UseSlot.tsx section are considered content and placed inside a `UseSlot.tsx` manually created.
 * After dividing the sections into two groups and create a indexed map, call the function recursively to its parent page.
 * When there's no parent page the algorithm will render the sections based the current @param implementations.
 *
 * At the end of the execution, the algorithm verifies if all `UseSlot.tsx` is used, if not (missing parent free slot), they are rendered at the page bottom.
 * The algorithm is very similar to how we use `Abstract` classes in other languages. So a inherit page is a kind of a class that can have `abstract` methods named `slots`.
 * The child pages can inherit from those classes and implement these methods. The only difference is that we do not fail on an invalid override.
 * @param props the page props
 * @param useSlotsFromChild the indexed implementation of child pages
 * @returns the rendered page
 */
const renderPage = (
  { layout, sections: maybeSections, fold }: Props,
  useSlotsFromChild: Record<string, UseSlotSection> = {},
  editMode = false,
): JSX.Element => {
  const validSections = maybeSections.filter(notUndefined);
  const layoutProps = layout?.props;
  const sections = Object.keys(useSlotsFromChild).length > 0
    ? validSections.flatMap(useSlots(useSlotsFromChild))
    : validSections;
  const _renderSection = renderSectionFor(editMode);

  if (layoutProps && isLivePageProps(layoutProps)) {
    const useSlots = indexedBySlotName(
      sections,
    );

    const rendered = renderPage(layoutProps, useSlots, editMode);
    // unmatchedSlots are `UseSlot.tsx` that did not find a corresponding `Slot.tsx` with the same name, by default they are rendered at bottom
    const unmatchedSlots = Object.values(useSlots).filter((impl) => !impl.used);
    const unmatchedSections = unmatchedSlots.flatMap((impl) =>
      Array.isArray(impl.useSection) ? impl.useSection : [impl.useSection]
    );
    return (
      <>
        {rendered}
        {unmatchedSections.map(_renderSection)}
      </>
    );
  }

  const url = usePageContext()!.url;

  const sectionsToRender = fold ?? 5 ?? sections.length - 1;
  if (url.searchParams.has("belowTheFold")) {
    const belowTheFoldSections = sections.slice(
      sectionsToRender,
      sections.length - 1,
    );
    return (
      <>
        {belowTheFoldSections.map(_renderSection)}
      </>
    );
  }

  const aboveTheFold = sections.slice(0, sectionsToRender);
  const footer = sections[sections.length - 1];
  const foldSection = {
    Component: () => <div id="LIVE_BELOW_THE_FOLD"></div>,
    props: {},
    metadata: {
      resolveChain: ["below-the-fold"],
      id: "below-the-fold",
      component: "below-the-fold",
    },
  };

  return (
    <>
      {[...aboveTheFold, foldSection, footer].map(_renderSection)}

      <script
        dangerouslySetInnerHTML={{ __html: `(${belowTheFold.toString()})()` }}
      >
      </script>
    </>
  );
};

export default function LivePage(
  props: Props,
): JSX.Element {
  const metadata = usePageContext()?.metadata;
  const routerCtx = useRouterContext();

  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: metadata?.id!,
        }}
      />
      <LiveAnalytics
        id={parseInt(metadata?.id ?? "-1")}
        flags={routerCtx?.flags}
        path={routerCtx?.pagePath}
      />
      {renderPage(props)}
    </>
  );
}

export function Preview(props: Props) {
  const pageCtx = usePageContext();
  const editMode = pageCtx?.url.searchParams.has("editMode") ?? false;

  return (
    <>
      {renderPage(props, {}, editMode)}
      {editMode && <LivePageEditor />}
    </>
  );
}
