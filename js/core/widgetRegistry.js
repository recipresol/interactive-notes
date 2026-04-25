import { createWidget as createFunctionSequenceExplorer } from "../widgets/functionSequenceExplorer.js";
import { createWidget as createFourierSeriesExplorer } from "../widgets/fourierSeriesExplorer.js";
import { createWidget as createDiscreteFourierTransformExplorer } from "../widgets/discreteFourierTransformExplorer.js";
import { createWidget as createAttentionHeadExplorer } from "../widgets/attentionHeadExplorer.js";
import { createWidget as createConvolutionExplorer } from "../widgets/convolutionExplorer.js";
import { createWidget as createGradientDescentExplorer } from "../widgets/gradientDescentExplorer.js";

const registry = {
    functionSequenceExplorer: createFunctionSequenceExplorer,
    fourierSeriesExplorer: createFourierSeriesExplorer,
    discreteFourierTransformExplorer: createDiscreteFourierTransformExplorer,
    attentionHeadExplorer: createAttentionHeadExplorer,
    convolutionExplorer: createConvolutionExplorer,
    gradientDescentExplorer: createGradientDescentExplorer
};

export function getWidgetFactory(name) {
    return registry[name] || null;
}
