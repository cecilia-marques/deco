export { onBeforeResolveProps } from "../../commons/multivariate.ts";
import { MultivariateFlag } from "../../blocks/flag.ts";
import { Section } from "../../blocks/section.ts";
import multivariate, { MultivariateProps } from "../../commons/multivariate.ts";

/**
 * @title Section Variants
 */
export default function SectionVariants(
  props: MultivariateProps<Section>,
): MultivariateFlag<Section> {
  return multivariate(props);
}
