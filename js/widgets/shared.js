export const SVG_NS = "http://www.w3.org/2000/svg";

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function formatNumber(value, digits = 2) {
    return Number(value).toFixed(digits);
}

export function getKatexRenderer() {
    return window.katex && typeof window.katex.render === "function"
        ? window.katex.render
        : null;
}

export function renderKatex(element, expression) {
    const katexRender = getKatexRenderer();

    if (!element) {
        return;
    }

    if (!katexRender) {
        element.textContent = expression;
        return;
    }

    katexRender(expression, element, { throwOnError: false });
}

export function createParameterSlider(options = {}) {
    const {
        label = "",
        min = "0",
        max = "1",
        step = "1",
        value = min,
        orientation = "horizontal"
    } = options;
    const sliderOrientation = orientation === "vertical" ? "vertical" : "horizontal";

    const element = document.createElement("label");
    element.className = `widget-parameter-control widget-parameter-control-${sliderOrientation}`;

    const labelElement = document.createElement("span");
    labelElement.className = "widget-parameter-label";
    renderKatex(labelElement, label);

    const input = document.createElement("input");
    input.className = `widget-parameter-slider widget-parameter-slider-${sliderOrientation}`;
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute("aria-orientation", sliderOrientation);

    const valueElement = document.createElement("span");
    valueElement.className = "widget-parameter-value";

    element.append(labelElement, input, valueElement);

    return {
        element,
        label: labelElement,
        input,
        value: valueElement
    };
}

export function createSvgElement(tagName, className) {
    const element = document.createElementNS(SVG_NS, tagName);

    if (className) {
        element.setAttribute("class", className);
    }

    return element;
}

export function setLine(line, x1, y1, x2, y2) {
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
}

export function dot(a, b) {
    return (a[0] * b[0]) + (a[1] * b[1]);
}

export function addScaled(sum, vector, scale) {
    return [
        sum[0] + (vector[0] * scale),
        sum[1] + (vector[1] * scale)
    ];
}

export function applyMatrix(matrix, vector) {
    return [
        (matrix[0][0] * vector[0]) + (matrix[0][1] * vector[1]),
        (matrix[1][0] * vector[0]) + (matrix[1][1] * vector[1])
    ];
}

export function softmax(values) {
    const maxValue = Math.max(...values);
    const exponentials = values.map((value) => Math.exp(value - maxValue));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    return exponentials.map((value) => value / total);
}

export function cloneMatrix(matrix) {
    return matrix.map((row) => [...row]);
}
