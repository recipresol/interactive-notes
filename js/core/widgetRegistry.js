import { createWidget as createFunctionSequenceExplorer } from "../widgets/functionSequenceExplorer.js";

const registry = {
    functionSequenceExplorer: createFunctionSequenceExplorer
};

export function getWidgetFactory(name) {
    return registry[name] || null;
}
