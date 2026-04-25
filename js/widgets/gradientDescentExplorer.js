import { clamp, createSvgElement, formatNumber, renderKatex } from "./shared.js";

const VIEWBOX_SIZE = 100;
const PLOT_MIN = 8;
const PLOT_MAX = 92;
const DOMAIN_MIN = -2.2;
const DOMAIN_MAX = 2.2;
const CONTOUR_LEVELS = [0.12, 0.24, 0.42, 0.68, 1.02, 1.48, 2.08, 2.86, 3.86, 5.1];
const OBJECTIVE = {
    a: 1.5,
    b: 0.55,
    c: 0.34
};

function toSvgPoint(point) {
    const [x, y] = point;
    const ratioX = (x - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN);
    const ratioY = (y - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN);
    return [
        PLOT_MIN + ratioX * (PLOT_MAX - PLOT_MIN),
        PLOT_MAX - ratioY * (PLOT_MAX - PLOT_MIN)
    ];
}

function fromSvgPoint(x, y) {
    const ratioX = (x - PLOT_MIN) / (PLOT_MAX - PLOT_MIN);
    const ratioY = (PLOT_MAX - y) / (PLOT_MAX - PLOT_MIN);
    return [
        clamp(DOMAIN_MIN + ratioX * (DOMAIN_MAX - DOMAIN_MIN), DOMAIN_MIN, DOMAIN_MAX),
        clamp(DOMAIN_MIN + ratioY * (DOMAIN_MAX - DOMAIN_MIN), DOMAIN_MIN, DOMAIN_MAX)
    ];
}

function objective(point) {
    const [x, y] = point;
    return 0.5 * ((OBJECTIVE.a * x * x) + (OBJECTIVE.b * y * y)) + (OBJECTIVE.c * x * y);
}

function gradient(point) {
    const [x, y] = point;
    return [
        OBJECTIVE.a * x + OBJECTIVE.c * y,
        OBJECTIVE.b * y + OBJECTIVE.c * x
    ];
}

function nextPoint(point, stepSize) {
    const grad = gradient(point);
    return [
        clamp(point[0] - stepSize * grad[0], DOMAIN_MIN, DOMAIN_MAX),
        clamp(point[1] - stepSize * grad[1], DOMAIN_MIN, DOMAIN_MAX)
    ];
}

function computePath(start, stepSize, iterations) {
    const path = [[...start]];

    for (let index = 0; index < iterations; index += 1) {
        path.push(nextPoint(path[path.length - 1], stepSize));
    }

    return path;
}

function contourPath(level) {
    const points = [];
    const sampleCount = 180;

    for (let sample = 0; sample <= sampleCount; sample += 1) {
        const angle = (2 * Math.PI * sample) / sampleCount;
        const direction = [Math.cos(angle), Math.sin(angle)];
        const denominator = 0.5 * ((OBJECTIVE.a * direction[0] * direction[0]) + (OBJECTIVE.b * direction[1] * direction[1])) + (OBJECTIVE.c * direction[0] * direction[1]);
        const radius = Math.sqrt(level / Math.max(denominator, 0.001));
        const point = [direction[0] * radius, direction[1] * radius];
        const [x, y] = toSvgPoint(point);
        points.push(`${sample === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }

    return `${points.join(" ")} Z`;
}

function polylinePoints(points) {
    return points
        .map((point) => {
            const [x, y] = toSvgPoint(point);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
}

export function createWidget(container, params, api = {}) {
    let dragging = false;
    let state = {
        point: Array.isArray(params.initialPoint) ? params.initialPoint.slice(0, 2) : [-1.7, 1.15],
        stepSize: Number.isFinite(params.initialStepSize) ? params.initialStepSize : 0.18,
        iterations: Number.isInteger(params.iterations) ? params.iterations : 14
    };

    const widget = document.createElement("div");
    widget.className = "gradient-widget";

    const plot = document.createElement("div");
    plot.className = "gradient-plot";

    const svg = createSvgElement("svg", "gradient-svg");
    svg.setAttribute("viewBox", `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
    svg.setAttribute("aria-label", "Contour plot with gradient descent iterates");

    const defs = createSvgElement("defs");
    const clipPath = createSvgElement("clipPath");
    clipPath.setAttribute("id", "gradient-plot-clip");
    const clipRect = createSvgElement("rect");
    clipRect.setAttribute("x", String(PLOT_MIN));
    clipRect.setAttribute("y", String(PLOT_MIN));
    clipRect.setAttribute("width", String(PLOT_MAX - PLOT_MIN));
    clipRect.setAttribute("height", String(PLOT_MAX - PLOT_MIN));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);

    const contourLayer = createSvgElement("g", "gradient-contour-layer");
    contourLayer.setAttribute("clip-path", "url(#gradient-plot-clip)");
    const axisLayer = createSvgElement("g", "gradient-axis-layer");
    const pathLayer = createSvgElement("g", "gradient-path-layer");
    pathLayer.setAttribute("clip-path", "url(#gradient-plot-clip)");
    const pointLayer = createSvgElement("g", "gradient-point-layer");
    pointLayer.setAttribute("clip-path", "url(#gradient-plot-clip)");
    svg.append(defs, contourLayer, axisLayer, pathLayer, pointLayer);
    plot.appendChild(svg);

    const controls = document.createElement("div");
    controls.className = "gradient-controls";

    const stepControl = document.createElement("label");
    stepControl.className = "gradient-control";
    const stepLabel = document.createElement("span");
    renderKatex(stepLabel, "\\eta");
    const stepSlider = document.createElement("input");
    stepSlider.type = "range";
    stepSlider.min = "0.02";
    stepSlider.max = "0.62";
    stepSlider.step = "0.01";
    const stepValue = document.createElement("span");
    stepValue.className = "gradient-control-value";
    stepControl.append(stepLabel, stepSlider, stepValue);

    const iterControl = document.createElement("label");
    iterControl.className = "gradient-control";
    const iterLabel = document.createElement("span");
    renderKatex(iterLabel, "T");
    const iterSlider = document.createElement("input");
    iterSlider.type = "range";
    iterSlider.min = "1";
    iterSlider.max = "24";
    iterSlider.step = "1";
    const iterValue = document.createElement("span");
    iterValue.className = "gradient-control-value";
    iterControl.append(iterLabel, iterSlider, iterValue);

    controls.append(stepControl, iterControl);

    const readout = document.createElement("p");
    readout.className = "widget-output gradient-output";

    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.className = "gradient-check";
    checkButton.textContent = "Check";

    widget.append(plot, controls, readout, checkButton);
    container.replaceChildren(widget);

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function getState() {
        return {
            point: [...state.point],
            stepSize: state.stepSize,
            iterations: state.iterations
        };
    }

    function setState(nextState) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }

        state = {
            point: Array.isArray(nextState.point) && nextState.point.length === 2
                ? [
                    clamp(Number.parseFloat(nextState.point[0]) || 0, DOMAIN_MIN, DOMAIN_MAX),
                    clamp(Number.parseFloat(nextState.point[1]) || 0, DOMAIN_MIN, DOMAIN_MAX)
                ]
                : state.point,
            stepSize: clamp(Number.parseFloat(nextState.stepSize) || state.stepSize, 0.02, 0.62),
            iterations: clamp(Math.round(Number.parseFloat(nextState.iterations) || state.iterations), 1, 24)
        };
        sync();
    }

    function renderStaticLayers() {
        contourLayer.replaceChildren();
        axisLayer.replaceChildren();

        CONTOUR_LEVELS.forEach((level) => {
            const contour = createSvgElement("path", "gradient-contour");
            contour.setAttribute("d", contourPath(level));
            contourLayer.appendChild(contour);
        });

        const xAxis = createSvgElement("line", "gradient-axis");
        const [x1, y1] = toSvgPoint([DOMAIN_MIN, 0]);
        const [x2, y2] = toSvgPoint([DOMAIN_MAX, 0]);
        xAxis.setAttribute("x1", String(x1));
        xAxis.setAttribute("y1", String(y1));
        xAxis.setAttribute("x2", String(x2));
        xAxis.setAttribute("y2", String(y2));

        const yAxis = createSvgElement("line", "gradient-axis");
        const [x3, y3] = toSvgPoint([0, DOMAIN_MIN]);
        const [x4, y4] = toSvgPoint([0, DOMAIN_MAX]);
        yAxis.setAttribute("x1", String(x3));
        yAxis.setAttribute("y1", String(y3));
        yAxis.setAttribute("x2", String(x4));
        yAxis.setAttribute("y2", String(y4));

        const border = createSvgElement("rect", "gradient-plot-border");
        border.setAttribute("x", String(PLOT_MIN));
        border.setAttribute("y", String(PLOT_MIN));
        border.setAttribute("width", String(PLOT_MAX - PLOT_MIN));
        border.setAttribute("height", String(PLOT_MAX - PLOT_MIN));
        axisLayer.append(border, xAxis, yAxis);
    }

    function sync() {
        state.point = [
            clamp(Number.parseFloat(state.point[0]) || 0, DOMAIN_MIN, DOMAIN_MAX),
            clamp(Number.parseFloat(state.point[1]) || 0, DOMAIN_MIN, DOMAIN_MAX)
        ];
        state.stepSize = clamp(Number.parseFloat(state.stepSize) || 0.02, 0.02, 0.62);
        state.iterations = clamp(Math.round(Number.parseFloat(state.iterations) || 1), 1, 24);

        stepSlider.value = String(state.stepSize);
        iterSlider.value = String(state.iterations);
        stepValue.textContent = formatNumber(state.stepSize);
        iterValue.textContent = String(state.iterations);

        const path = computePath(state.point, state.stepSize, state.iterations);
        const finalPoint = path[path.length - 1];
        const grad = gradient(state.point);

        pathLayer.replaceChildren();
        pointLayer.replaceChildren();

        const polyline = createSvgElement("polyline", "gradient-descent-path");
        polyline.setAttribute("points", polylinePoints(path));
        pathLayer.appendChild(polyline);

        path.forEach((point, index) => {
            const [x, y] = toSvgPoint(point);
            const dot = createSvgElement("circle", index === 0 ? "gradient-start-dot" : "gradient-step-dot");
            const progress = index / Math.max(path.length - 1, 1);
            const radius = index === 0 ? 2.7 : Math.max(0.35, 2 - progress * 1.65);
            dot.setAttribute("cx", String(x));
            dot.setAttribute("cy", String(y));
            dot.setAttribute("r", String(radius));
            pointLayer.appendChild(dot);
        });

        const [startX, startY] = toSvgPoint(state.point);
        const handle = createSvgElement("circle", "gradient-start-handle");
        handle.setAttribute("cx", String(startX));
        handle.setAttribute("cy", String(startY));
        handle.setAttribute("r", "3.4");
        handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            dragging = true;
            updateDraggedPoint(event);
        });
        pointLayer.appendChild(handle);

        renderKatex(readout, `f(x_0)=${formatNumber(objective(state.point))}\\quad \\|\\nabla f(x_0)\\|=${formatNumber(Math.hypot(...grad))}\\quad f(x_T)=${formatNumber(objective(finalPoint))}`);
    }

    function updateDraggedPoint(event) {
        if (!dragging) {
            return;
        }

        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
        state = {
            ...state,
            point: fromSvgPoint(svgPoint.x, svgPoint.y)
        };
        sync();
    }

    function handleDocumentPointerMove(event) {
        if (dragging) {
            updateDraggedPoint(event);
        }
    }

    function handleDocumentPointerUp(event) {
        if (!dragging) {
            return;
        }

        updateDraggedPoint(event);
        dragging = false;
        emitState();
    }

    function handleStepInput() {
        state = {
            ...state,
            stepSize: Number.parseFloat(stepSlider.value)
        };
        sync();
        emitState();
    }

    function handleIterInput() {
        state = {
            ...state,
            iterations: Number.parseInt(iterSlider.value, 10)
        };
        sync();
        emitState();
    }

    function check() {
        const path = computePath(state.point, state.stepSize, state.iterations);
        const startValue = objective(path[0]);
        const finalValue = objective(path[path.length - 1]);

        if (finalValue < startValue * 0.35) {
            return {
                correct: true,
                message: "Good: the iterates have moved substantially down the objective."
            };
        }

        return {
            correct: false,
            message: "Try a moderate step size or a different starting point so the path descends closer to the center."
        };
    }

    renderStaticLayers();
    stepSlider.addEventListener("input", handleStepInput);
    iterSlider.addEventListener("input", handleIterInput);
    document.addEventListener("pointermove", handleDocumentPointerMove);
    document.addEventListener("pointerup", handleDocumentPointerUp);
    document.addEventListener("pointercancel", handleDocumentPointerUp);
    checkButton.addEventListener("click", () => {
        if (typeof api.onCheck === "function") {
            api.onCheck(check());
        }
    });

    sync();

    return {
        getState,
        setState,
        check,
        destroy() {
            stepSlider.removeEventListener("input", handleStepInput);
            iterSlider.removeEventListener("input", handleIterInput);
            document.removeEventListener("pointermove", handleDocumentPointerMove);
            document.removeEventListener("pointerup", handleDocumentPointerUp);
            document.removeEventListener("pointercancel", handleDocumentPointerUp);
        }
    };
}
