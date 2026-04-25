import { clamp, createParameterSlider, formatNumber, renderKatex } from "./shared.js";

function getDomain(params) {
    return Array.isArray(params.domain) ? params.domain : [0, 0.999];
}

function getMaxN(params) {
    return Number.isFinite(params.maxN) ? params.maxN : 50;
}

const PLOT_PADDING = 8;
const PLOT_MIN = PLOT_PADDING;
const PLOT_MAX = 100 - PLOT_PADDING;
const PLOT_SIZE = PLOT_MAX - PLOT_MIN;

function toPlotX(x, domainMin, domainMax) {
    return PLOT_MIN + (((x - domainMin) / (domainMax - domainMin || 1)) * PLOT_SIZE);
}

function toPlotY(y) {
    return PLOT_MAX - (y * PLOT_SIZE);
}

function getWitness(params, epsilon, N) {
    const [domainMin, domainMax] = getDomain(params);
    const x = epsilon ** (1 / N);
    const valueAtEdge = domainMax ** N;

    if (x <= domainMax) {
        return {
            inView: true,
            x: Math.max(x, domainMin),
            value: Math.max(epsilon, domainMin ** N)
        };
    }

    return {
        inView: false,
        x,
        value: valueAtEdge
    };
}

function buildCurvePath(params, N) {
    const [domainMin, domainMax] = getDomain(params);
    const sampleCount = 120;
    const points = [];

    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        const x = domainMin + ((domainMax - domainMin) * sampleIndex) / sampleCount;
        const y = x ** N;
        const plotX = toPlotX(x, domainMin, domainMax);
        const plotY = toPlotY(y);
        points.push(`${sampleIndex === 0 ? "M" : "L"} ${plotX.toFixed(2)} ${plotY.toFixed(2)}`);
    }

    return points.join(" ");
}

export function createWidget(container, params, api = {}) {
    let state = {
        epsilon: Number.isFinite(params.initialEpsilon) ? params.initialEpsilon : 0.2,
        N: Number.isFinite(params.initialN) ? params.initialN : 8
    };

    const widget = document.createElement("div");
    widget.className = "sequence-widget";

    const formula = document.createElement("div");
    formula.className = "sequence-widget-formula";

    const body = document.createElement("div");
    body.className = "sequence-widget-body";

    const plot = document.createElement("div");
    plot.className = "sequence-widget-plot";

    const plotSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    plotSvg.setAttribute("viewBox", "0 0 100 100");
    plotSvg.setAttribute("aria-label", "Graph of x to the N with epsilon reference line");

    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    yAxis.setAttribute("class", "sequence-widget-axis-line");
    yAxis.setAttribute("x1", String(PLOT_MIN));
    yAxis.setAttribute("x2", String(PLOT_MIN));
    yAxis.setAttribute("y1", String(PLOT_MIN));
    yAxis.setAttribute("y2", String(PLOT_MAX));

    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("class", "sequence-widget-axis-line");
    xAxis.setAttribute("x1", String(PLOT_MIN));
    xAxis.setAttribute("x2", String(PLOT_MAX));
    xAxis.setAttribute("y1", String(PLOT_MAX));
    xAxis.setAttribute("y2", String(PLOT_MAX));

    const epsilonLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    epsilonLine.setAttribute("class", "sequence-widget-epsilon-line");
    epsilonLine.setAttribute("x1", String(PLOT_MIN));
    epsilonLine.setAttribute("x2", String(PLOT_MAX));

    const functionPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    functionPath.setAttribute("class", "sequence-widget-curve");

    const witnessDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    witnessDot.setAttribute("class", "sequence-widget-witness");
    witnessDot.setAttribute("r", "1.2");

    plotSvg.append(yAxis, xAxis, epsilonLine, functionPath, witnessDot);

    const epsilonTag = document.createElement("div");
    epsilonTag.className = "sequence-widget-tag sequence-widget-tag-epsilon";

    const witnessTag = document.createElement("div");
    witnessTag.className = "sequence-widget-tag sequence-widget-tag-witness";

    const axisMin = document.createElement("span");
    axisMin.className = "sequence-widget-axis sequence-widget-axis-min";
    axisMin.textContent = "0";

    const axisMax = document.createElement("span");
    axisMax.className = "sequence-widget-axis sequence-widget-axis-max";
    axisMax.textContent = "1";

    plot.append(plotSvg, epsilonTag, witnessTag, axisMin, axisMax);

    const controls = document.createElement("div");
    controls.className = "sequence-widget-controls";

    const epsilonControl = createParameterSlider({
        label: "\\varepsilon",
        min: "0.02",
        max: "0.95",
        step: "0.01",
        orientation: "vertical"
    });
    const epsilonSlider = epsilonControl.input;
    const epsilonValue = epsilonControl.value;

    const nControl = createParameterSlider({
        label: "N",
        min: "1",
        max: String(getMaxN(params)),
        step: "1",
        orientation: "vertical"
    });
    const nSlider = nControl.input;
    const nValue = nControl.value;

    controls.append(epsilonControl.element, nControl.element);

    const output = document.createElement("p");
    output.className = "widget-output sequence-widget-output";

    body.append(controls, plot);
    widget.append(formula, body, output);
    container.replaceChildren(widget);

    renderKatex(formula, "f_n(x)=x^n");
    renderKatex(epsilonTag, "\\varepsilon");

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function syncPlot() {
        const witness = getWitness(params, state.epsilon, state.N);
        const [domainMin, domainMax] = getDomain(params);
        const curvePath = buildCurvePath(params, state.N);
        const epsilonY = toPlotY(state.epsilon);
        const witnessX = toPlotX(clamp(witness.x, domainMin, domainMax), domainMin, domainMax);
        const witnessY = toPlotY(clamp(witness.x, domainMin, domainMax) ** state.N);

        functionPath.setAttribute("d", curvePath);
        epsilonLine.setAttribute("y1", String(epsilonY));
        epsilonLine.setAttribute("y2", String(epsilonY));

        if (witness.inView) {
            witnessDot.setAttribute("cx", String(witnessX));
            witnessDot.setAttribute("cy", String(witnessY));
            witnessDot.style.display = "block";
            witnessTag.style.display = "block";
            witnessTag.style.left = `calc(${witnessX}% - 0.9rem)`;
            witnessTag.style.top = `calc(${witnessY}% - 2.1rem)`;
            renderKatex(witnessTag, `x\\approx ${formatNumber(witness.x, 2)}`);
        } else {
            witnessDot.style.display = "none";
            witnessTag.style.display = "none";
        }
    }

    function syncOutput() {
        const witness = getWitness(params, state.epsilon, state.N);

        if (witness.inView) {
            output.textContent = `A point near 1 still keeps x^N above epsilon.`;
            return;
        }

        output.textContent = "The obstruction is pushed almost all the way to 1.";
    }

    function syncControls() {
        epsilonSlider.value = String(state.epsilon);
        nSlider.value = String(state.N);
        epsilonValue.textContent = formatNumber(state.epsilon, 2);
        nValue.textContent = String(state.N);
        syncPlot();
        syncOutput();
    }

    function handleInput() {
        state = {
            epsilon: clamp(Number.parseFloat(epsilonSlider.value) || 0.02, 0.02, 0.95),
            N: clamp(Math.round(Number.parseFloat(nSlider.value) || 1), 1, getMaxN(params))
        };
        syncControls();
        emitState();
    }

    function getState() {
        return { ...state };
    }

    function setState(nextState) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }

        state = {
            epsilon: clamp(Number.parseFloat(nextState.epsilon) || state.epsilon, 0.02, 0.95),
            N: clamp(Math.round(Number.parseFloat(nextState.N) || state.N), 1, getMaxN(params))
        };
        syncControls();
    }

    function check() {
        const witness = getWitness(params, state.epsilon, state.N);

        if (witness.inView) {
            return {
                correct: true,
                message: `Right: choosing $x \\approx ${formatNumber(witness.x, 2)}$ gives $x^N \\approx ${formatNumber(witness.value, 2)} \\geq \\varepsilon$, so one finite $N$ still fails near $1$.`
            };
        }

        return {
            correct: true,
            message: `Right: the trouble is still near $x=1$. Here you need $x \\approx ${formatNumber(witness.x, 3)}$, just beyond the plotted window.`
        };
    }

    epsilonSlider.addEventListener("input", handleInput);
    nSlider.addEventListener("input", handleInput);

    syncControls();

    return {
        getState,
        setState,
        check,
        destroy() {
            epsilonSlider.removeEventListener("input", handleInput);
            nSlider.removeEventListener("input", handleInput);
        }
    };
}
