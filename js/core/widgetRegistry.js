import { createWidget as createFunctionSequenceExplorer } from "../widgets/functionSequenceExplorer.js";
import { createWidget as createFourierSeriesExplorer } from "../widgets/fourierSeriesExplorer.js";
import { createWidget as createDiscreteFourierTransformExplorer } from "../widgets/discreteFourierTransformExplorer.js";

const registry = {
    functionSequenceExplorer: createFunctionSequenceExplorer,
    fourierSeriesExplorer: createFourierSeriesExplorer,
    discreteFourierTransformExplorer: createDiscreteFourierTransformExplorer
};

export function getWidgetFactory(name) {
    return registry[name] || null;
}
