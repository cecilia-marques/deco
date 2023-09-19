export { onBeforeResolveProps } from "../../commons/multivariate.ts";
import { MultivariateFlag } from "../../blocks/flag.ts";
import { Section } from "../../blocks/section.ts";
import multivariate, { MultivariateProps } from "../../commons/multivariate.ts";

/**
 * @title Page Variants
 */
export default function PageVariants(
  props: MultivariateProps<Section[]>,
): MultivariateFlag<Section[]> {
  return multivariate(props);
}
