function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 2) {
    return Number(value).toFixed(digits);
}

function getKatexRenderer() {
    return window.katex && typeof window.katex.render === "function"
        ? window.katex.render
        : null;
}

function renderKatex(element, expression) {
    const katexRender = getKatexRenderer();

    if (!element) {
        return;
    }

    if (!katexRender) {
        element.textContent = expression;
        return;
    }

    katexRender(expression, element, {
        throwOnError: false
    });
}

function getMaxTerms(params) {
    return Number.isFinite(params.maxTerms) ? params.maxTerms : 25;
}

function getWaveforms(params) {
    return Array.isArray(params.waveforms) && params.waveforms.length > 0
        ? params.waveforms
        : ["square", "sawtooth", "triangle"];
}

const WAVEFORM_LABELS = {
    square: "Square",
    sawtooth: "Sawtooth",
    triangle: "Triangle"
};

const PLOT_PADDING = 8;
const PLOT_MIN = PLOT_PADDING;
const PLOT_MAX = 100 - PLOT_PADDING;
const PLOT_SIZE = PLOT_MAX - PLOT_MIN;
const SAMPLE_COUNT = 220;

function toPlotX(t) {
    return PLOT_MIN + ((t + Math.PI) / (2 * Math.PI)) * PLOT_SIZE;
}

function toPlotY(y) {
    const normalized = (clamp(y, -1.35, 1.35) + 1.35) / 2.7;
    return PLOT_MAX - (normalized * PLOT_SIZE);
}

function targetValue(waveform, t) {
    if (waveform === "sawtooth") {
        return t / Math.PI;
    }

    if (waveform === "triangle") {
        return (2 / Math.PI) * Math.asin(Math.sin(t));
    }

    return t < 0 ? -1 : 1;
}

function partialSum(waveform, t, terms) {
    let total = 0;

    if (waveform === "sawtooth") {
        for (let n = 1; n <= terms; n += 1) {
            total += ((-1) ** (n + 1)) * Math.sin(n * t) / n;
        }

        return (2 / Math.PI) * total;
    }

    if (waveform === "triangle") {
        for (let k = 0; k < terms; k += 1) {
            const n = (2 * k) + 1;
            total += ((-1) ** k) * Math.sin(n * t) / (n * n);
        }

        return (8 / (Math.PI * Math.PI)) * total;
    }

    for (let k = 0; k < terms; k += 1) {
        const n = (2 * k) + 1;
        total += Math.sin(n * t) / n;
    }

    return (4 / Math.PI) * total;
}

function buildPath(valueFn) {
    const points = [];

    for (let sampleIndex = 0; sampleIndex <= SAMPLE_COUNT; sampleIndex += 1) {
        const t = -Math.PI + ((2 * Math.PI * sampleIndex) / SAMPLE_COUNT);
        const x = toPlotX(t);
        const y = toPlotY(valueFn(t));
        points.push(`${sampleIndex === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }

    return points.join(" ");
}

function estimateError(waveform, terms) {
    let maxError = 0;

    for (let sampleIndex = 0; sampleIndex <= SAMPLE_COUNT; sampleIndex += 1) {
        const t = -Math.PI + ((2 * Math.PI * sampleIndex) / SAMPLE_COUNT);
        const target = targetValue(waveform, t);
        const approximation = partialSum(waveform, t, terms);
        maxError = Math.max(maxError, Math.abs(target - approximation));
    }

    return maxError;
}

function getFormula(waveform, terms) {
    if (waveform === "sawtooth") {
        return `S_{${terms}}(t)=\\frac{2}{\\pi}\\sum_{n=1}^{${terms}}(-1)^{n+1}\\frac{\\sin(nt)}{n}`;
    }

    if (waveform === "triangle") {
        return `S_{${terms}}(t)=\\frac{8}{\\pi^2}\\sum_{k=0}^{${terms - 1}}(-1)^k\\frac{\\sin((2k+1)t)}{(2k+1)^2}`;
    }

    return `S_{${terms}}(t)=\\frac{4}{\\pi}\\sum_{k=0}^{${terms - 1}}\\frac{\\sin((2k+1)t)}{2k+1}`;
}

export function createWidget(container, params, api = {}) {
    const waveforms = getWaveforms(params);
    const maxTerms = getMaxTerms(params);
    let state = {
        waveform: waveforms.includes(params.initialWaveform) ? params.initialWaveform : waveforms[0],
        terms: Number.isFinite(params.initialTerms) ? params.initialTerms : 5
    };

    const widget = document.createElement("div");
    widget.className = "fourier-widget";

    const header = document.createElement("div");
    header.className = "fourier-widget-header";

    const formula = document.createElement("div");
    formula.className = "fourier-widget-formula";

    const errorBadge = document.createElement("p");
    errorBadge.className = "fourier-widget-error";

    header.append(formula, errorBadge);

    const controls = document.createElement("div");
    controls.className = "fourier-widget-controls";

    const waveformGroup = document.createElement("div");
    waveformGroup.className = "fourier-widget-waveforms";
    waveformGroup.setAttribute("aria-label", "Waveform");

    const waveformButtons = new Map();
    for (const waveform of waveforms) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "fourier-widget-waveform";
        button.textContent = WAVEFORM_LABELS[waveform] || waveform;
        button.addEventListener("click", () => {
            state = { ...state, waveform };
            sync();
            emitState();
        });
        waveformButtons.set(waveform, button);
        waveformGroup.appendChild(button);
    }

    const termControl = document.createElement("label");
    termControl.className = "fourier-widget-term-control";

    const termLabel = document.createElement("span");
    termLabel.className = "fourier-widget-term-label";

    const termSlider = document.createElement("input");
    termSlider.className = "fourier-widget-slider";
    termSlider.type = "range";
    termSlider.min = "1";
    termSlider.max = String(maxTerms);
    termSlider.step = "1";

    const termValue = document.createElement("span");
    termValue.className = "fourier-widget-term-value";

    termControl.append(termLabel, termSlider, termValue);
    controls.append(waveformGroup, termControl);

    const plot = document.createElement("div");
    plot.className = "fourier-widget-plot";

    const plotSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    plotSvg.setAttribute("viewBox", "0 0 100 100");
    plotSvg.setAttribute("aria-label", "Fourier partial sum compared with the target wave");

    const midline = document.createElementNS("http://www.w3.org/2000/svg", "line");
    midline.setAttribute("class", "fourier-widget-midline");
    midline.setAttribute("x1", String(PLOT_MIN));
    midline.setAttribute("x2", String(PLOT_MAX));
    midline.setAttribute("y1", String(toPlotY(0)));
    midline.setAttribute("y2", String(toPlotY(0)));

    const targetPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    targetPath.setAttribute("class", "fourier-widget-target");

    const sumPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    sumPath.setAttribute("class", "fourier-widget-sum");

    plotSvg.append(midline, targetPath, sumPath);

    const axisLeft = document.createElement("span");
    axisLeft.className = "fourier-widget-axis fourier-widget-axis-left";
    axisLeft.textContent = "-pi";

    const axisCenter = document.createElement("span");
    axisCenter.className = "fourier-widget-axis fourier-widget-axis-center";
    axisCenter.textContent = "0";

    const axisRight = document.createElement("span");
    axisRight.className = "fourier-widget-axis fourier-widget-axis-right";
    axisRight.textContent = "pi";

    plot.append(plotSvg, axisLeft, axisCenter, axisRight);

    const legend = document.createElement("div");
    legend.className = "fourier-widget-legend";
    legend.innerHTML = `
        <span><i class="fourier-widget-key fourier-widget-key-target"></i>target</span>
        <span><i class="fourier-widget-key fourier-widget-key-sum"></i>partial sum</span>
    `;

    const output = document.createElement("p");
    output.className = "widget-output fourier-widget-output";

    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.className = "fourier-widget-check";
    checkButton.textContent = "Check";

    widget.append(header, controls, plot, legend, output, checkButton);
    container.replaceChildren(widget);

    renderKatex(termLabel, "terms");

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function getState() {
        return { ...state };
    }

    function setState(nextState) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }

        state = {
            waveform: waveforms.includes(nextState.waveform) ? nextState.waveform : state.waveform,
            terms: clamp(Math.round(Number.parseFloat(nextState.terms) || state.terms), 1, maxTerms)
        };
        sync();
    }

    function syncOutput(error) {
        if (state.waveform === "square" && state.terms >= 9) {
            output.textContent = "More terms sharpen the jump, but the overshoot near the discontinuity does not simply vanish.";
            return;
        }

        if (state.waveform === "triangle") {
            output.textContent = "The faster coefficient decay makes the triangle wave settle down much more quickly.";
            return;
        }

        output.textContent = `The current sampled maximum error is about ${formatNumber(error)}.`;
    }

    function sync() {
        state.terms = clamp(Math.round(Number.parseFloat(state.terms) || 1), 1, maxTerms);
        termSlider.value = String(state.terms);
        termValue.textContent = String(state.terms);

        for (const [waveform, button] of waveformButtons) {
            button.classList.toggle("is-selected", waveform === state.waveform);
            button.setAttribute("aria-pressed", waveform === state.waveform ? "true" : "false");
        }

        const error = estimateError(state.waveform, state.terms);
        targetPath.setAttribute("d", buildPath((t) => targetValue(state.waveform, t)));
        sumPath.setAttribute("d", buildPath((t) => partialSum(state.waveform, t, state.terms)));
        renderKatex(formula, getFormula(state.waveform, state.terms));
        errorBadge.textContent = `sampled error ${formatNumber(error)}`;
        syncOutput(error);
    }

    function check() {
        if (state.waveform === "square" && state.terms >= 9) {
            return {
                correct: true,
                message: "Good: adding terms helps away from the jump, while the visible overshoot hints at the Gibbs phenomenon."
            };
        }

        if (state.waveform === "triangle" && state.terms >= 4) {
            return {
                correct: true,
                message: "Good: the triangle series converges quickly because its coefficients shrink like $1/n^2$."
            };
        }

        if (state.terms >= 8) {
            return {
                correct: true,
                message: "Good: the partial sum is visibly tracking the shape. Notice where the error concentrates."
            };
        }

        return {
            correct: false,
            message: "Try increasing the number of terms until the approximation changes shape in a meaningful way."
        };
    }

    function handleTermInput() {
        state = {
            ...state,
            terms: clamp(Math.round(Number.parseFloat(termSlider.value) || 1), 1, maxTerms)
        };
        sync();
        emitState();
    }

    termSlider.addEventListener("input", handleTermInput);
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
            termSlider.removeEventListener("input", handleTermInput);
        }
    };
}
