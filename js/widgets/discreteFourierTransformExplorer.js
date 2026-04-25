import { clamp, createParameterSlider, createSvgElement, formatNumber, setLine } from "./shared.js";

function getSampleCount(params) {
    return Number.isInteger(params.sampleCount) ? clamp(params.sampleCount, 4, 16) : 8;
}

function getMaxAmplitude(params) {
    return Number.isFinite(params.maxAmplitude) ? params.maxAmplitude : 1.2;
}

function createPreset(name, sampleCount) {
    const samples = [];

    for (let index = 0; index < sampleCount; index += 1) {
        const t = (2 * Math.PI * index) / sampleCount;

        if (name === "pulse") {
            samples.push(index < sampleCount / 4 ? 1 : 0);
        } else if (name === "step") {
            samples.push(index < sampleCount / 2 ? 0.9 : -0.9);
        } else if (name === "singleTone") {
            samples.push(Math.sin(t));
        } else {
            samples.push((0.75 * Math.sin(t)) + (0.45 * Math.sin(3 * t)));
        }
    }

    return samples.map((value) => Number(value.toFixed(3)));
}

function dft(samples) {
    const sampleCount = samples.length;
    const coefficients = [];

    for (let k = 0; k < sampleCount; k += 1) {
        let real = 0;
        let imag = 0;

        for (let n = 0; n < sampleCount; n += 1) {
            const angle = (-2 * Math.PI * k * n) / sampleCount;
            real += samples[n] * Math.cos(angle);
            imag += samples[n] * Math.sin(angle);
        }

        coefficients.push({
            real,
            imag,
            magnitude: Math.hypot(real, imag) / sampleCount
        });
    }

    return coefficients;
}

function inverseDft(coefficients, keptBins) {
    const sampleCount = coefficients.length;
    const samples = [];
    const activeBins = getActiveBins(sampleCount, keptBins);

    for (let n = 0; n < sampleCount; n += 1) {
        let real = 0;

        for (let k = 0; k < sampleCount; k += 1) {
            if (!activeBins.has(k)) {
                continue;
            }

            const angle = (2 * Math.PI * k * n) / sampleCount;
            real += (coefficients[k].real * Math.cos(angle)) - (coefficients[k].imag * Math.sin(angle));
        }

        samples.push(real / sampleCount);
    }

    return samples;
}

function getActiveBins(sampleCount, keptBins) {
    const activeBins = new Set([0]);

    for (let k = 1; k <= keptBins; k += 1) {
        activeBins.add(k);
        activeBins.add((sampleCount - k) % sampleCount);
    }

    return activeBins;
}

const PRESETS = [
    ["twoTone", "Two tone"],
    ["singleTone", "Single tone"],
    ["step", "Step"],
    ["pulse", "Pulse"]
];

const VIEWBOX_WIDTH = 272;
const VIEWBOX_HEIGHT = 64;
const PLOT_LEFT = 16;
const PLOT_RIGHT = 256;
const TIME_ZERO_Y = 32;
const FREQ_BASELINE_Y = 54;
const TOP_Y = 8;
const BOTTOM_Y = 56;

function getPlotX(index, count) {
    if (count <= 1) {
        return (PLOT_LEFT + PLOT_RIGHT) / 2;
    }

    return PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * index) / (count - 1);
}

function valueToTimeY(value, maxAmplitude) {
    const normalized = clamp(value / maxAmplitude, -1, 1);
    return TIME_ZERO_Y - (normalized * ((BOTTOM_Y - TOP_Y) / 2));
}

function timeYToValue(y, maxAmplitude) {
    const normalized = (TIME_ZERO_Y - y) / ((BOTTOM_Y - TOP_Y) / 2);
    return clamp(normalized * maxAmplitude, -maxAmplitude, maxAmplitude);
}

function magnitudeToY(value, maxValue) {
    const normalized = maxValue > 0 ? clamp(value / maxValue, 0, 1) : 0;
    return FREQ_BASELINE_Y - (normalized * (FREQ_BASELINE_Y - TOP_Y));
}

export function createWidget(container, params, api = {}) {
    const sampleCount = getSampleCount(params);
    const maxAmplitude = getMaxAmplitude(params);
    const maxKeptBins = Math.floor(sampleCount / 2);
    let draggingIndex = null;
    let state = {
        preset: params.initialPreset || "twoTone",
        samples: createPreset(params.initialPreset || "twoTone", sampleCount),
        keptBins: Number.isFinite(params.initialKeptBins) ? params.initialKeptBins : 2
    };

    const widget = document.createElement("div");
    widget.className = "dft-widget";

    const presetBar = document.createElement("div");
    presetBar.className = "dft-widget-presets";

    const presetButtons = new Map();
    for (const [preset, label] of PRESETS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dft-widget-preset";
        button.textContent = label;
        button.addEventListener("click", () => {
            state = {
                ...state,
                preset,
                samples: createPreset(preset, sampleCount)
            };
            sync();
            emitState();
        });
        presetButtons.set(preset, button);
        presetBar.appendChild(button);
    }

    const plots = document.createElement("div");
    plots.className = "dft-widget-plots";

    const timePlot = createPlot("signal + reconstruction", "Drag blue points up or down");
    const frequencyPlot = createPlot("DFT magnitudes + kept bins", "Aligned by bin/sample index");
    plots.append(timePlot.element, frequencyPlot.element);

    const keepControl = createParameterSlider({
        label: "\\text{kept bins}",
        min: "0",
        max: String(maxKeptBins),
        step: "1"
    });
    const keepSlider = keepControl.input;
    const keepValue = keepControl.value;

    const legend = document.createElement("div");
    legend.className = "dft-widget-legend";
    legend.innerHTML = `
        <span><i class="dft-widget-key dft-widget-key-signal"></i>signal</span>
        <span><i class="dft-widget-key dft-widget-key-reconstruction"></i>reconstruction</span>
        <span><i class="dft-widget-key dft-widget-key-frequency"></i>DFT</span>
        <span><i class="dft-widget-key dft-widget-key-kept"></i>kept</span>
    `;

    const output = document.createElement("p");
    output.className = "widget-output dft-widget-output";

    widget.append(presetBar, plots, keepControl.element, legend, output);
    container.replaceChildren(widget);

    function createPlot(title, subtitle) {
        const element = document.createElement("section");
        element.className = "dft-widget-plot";

        const header = document.createElement("div");
        header.className = "dft-widget-plot-header";

        const heading = document.createElement("h3");
        heading.className = "dft-widget-plot-title";
        heading.textContent = title;

        const note = document.createElement("p");
        note.className = "dft-widget-plot-note";
        note.textContent = subtitle;

        const svg = createSvgElement("svg", "dft-widget-svg");
        svg.setAttribute("viewBox", `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`);

        const gridLayer = createSvgElement("g", "dft-widget-grid-layer");
        const reconstructionLayer = createSvgElement("g", "dft-widget-reconstruction-layer");
        const signalLayer = createSvgElement("g", "dft-widget-signal-layer");
        const labelLayer = createSvgElement("g", "dft-widget-label-layer");
        svg.append(gridLayer, reconstructionLayer, signalLayer, labelLayer);

        header.append(heading, note);
        element.append(header, svg);

        return {
            element,
            svg,
            gridLayer,
            reconstructionLayer,
            signalLayer,
            labelLayer
        };
    }

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function getState() {
        return {
            preset: state.preset,
            samples: [...state.samples],
            keptBins: state.keptBins
        };
    }

    function setState(nextState) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }

        const samples = Array.isArray(nextState.samples) && nextState.samples.length === sampleCount
            ? nextState.samples.map((value) => clamp(Number.parseFloat(value) || 0, -maxAmplitude, maxAmplitude))
            : state.samples;

        state = {
            preset: typeof nextState.preset === "string" ? nextState.preset : state.preset,
            samples,
            keptBins: clamp(Math.round(Number.parseFloat(nextState.keptBins) || state.keptBins), 0, maxKeptBins)
        };
        sync();
    }

    function renderGrid(plot, baselineY, options = {}) {
        plot.gridLayer.replaceChildren();
        plot.labelLayer.replaceChildren();

        const midline = createSvgElement("line", "dft-widget-axis-line");
        setLine(midline, PLOT_LEFT, baselineY, PLOT_RIGHT, baselineY);
        plot.gridLayer.appendChild(midline);

        for (let index = 0; index < sampleCount; index += 1) {
            const x = getPlotX(index, sampleCount);
            const tick = createSvgElement("line", "dft-widget-tick");
            setLine(tick, x, baselineY - 2, x, baselineY + 2);

            const label = createSvgElement("text", "dft-widget-axis-label");
            label.setAttribute("x", String(x));
            label.setAttribute("y", String(VIEWBOX_HEIGHT - 2));
            label.textContent = String(index);

            plot.gridLayer.appendChild(tick);
            plot.labelLayer.appendChild(label);
        }

        if (options.showBounds) {
            for (const y of [TOP_Y, BOTTOM_Y]) {
                const bound = createSvgElement("line", "dft-widget-bound-line");
                setLine(bound, PLOT_LEFT, y, PLOT_RIGHT, y);
                plot.gridLayer.appendChild(bound);
            }
        }
    }

    function renderTimePlot(reconstruction) {
        renderGrid(timePlot, TIME_ZERO_Y, { showBounds: true });
        timePlot.reconstructionLayer.replaceChildren();
        timePlot.signalLayer.replaceChildren();

        reconstruction.forEach((value, index) => {
            const x = getPlotX(index, sampleCount);
            const y = valueToTimeY(value, maxAmplitude);
            const stem = createSvgElement("line", "dft-widget-reconstruction-stem");
            setLine(stem, x, TIME_ZERO_Y, x, y);

            const dot = createSvgElement("circle", "dft-widget-reconstruction-dot");
            dot.setAttribute("cx", String(x));
            dot.setAttribute("cy", String(y));
            dot.setAttribute("r", "1.35");

            timePlot.reconstructionLayer.append(stem, dot);
        });

        state.samples.forEach((value, index) => {
            const x = getPlotX(index, sampleCount);
            const y = valueToTimeY(value, maxAmplitude);
            const stem = createSvgElement("line", "dft-widget-signal-stem");
            setLine(stem, x, TIME_ZERO_Y, x, y);

            const handle = createSvgElement("circle", "dft-widget-signal-handle");
            handle.setAttribute("cx", String(x));
            handle.setAttribute("cy", String(y));
            handle.setAttribute("r", "2.4");
            handle.setAttribute("tabindex", "0");
            handle.setAttribute("role", "slider");
            handle.setAttribute("aria-label", `Sample ${index}`);
            handle.setAttribute("aria-valuemin", String(-maxAmplitude));
            handle.setAttribute("aria-valuemax", String(maxAmplitude));
            handle.setAttribute("aria-valuenow", formatNumber(value));
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                draggingIndex = index;
                updateDraggedSample(event);
            });
            handle.addEventListener("keydown", (event) => {
                const step = event.shiftKey ? 0.2 : 0.05;
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
                    return;
                }

                event.preventDefault();
                const direction = event.key === "ArrowUp" ? 1 : -1;
                updateSample(index, state.samples[index] + (direction * step), true);
            });

            timePlot.signalLayer.append(stem, handle);
        });
    }

    function renderFrequencyPlot(magnitudes) {
        const activeBins = getActiveBins(sampleCount, state.keptBins);
        const maxMagnitude = Math.max(...magnitudes, 0.1);

        renderGrid(frequencyPlot, FREQ_BASELINE_Y);
        frequencyPlot.reconstructionLayer.replaceChildren();
        frequencyPlot.signalLayer.replaceChildren();

        magnitudes.forEach((magnitude, index) => {
            const x = getPlotX(index, sampleCount);
            const y = magnitudeToY(magnitude, maxMagnitude);
            const fullStem = createSvgElement("line", "dft-widget-frequency-stem");
            setLine(fullStem, x, FREQ_BASELINE_Y, x, y);

            const fullDot = createSvgElement("circle", "dft-widget-frequency-dot");
            fullDot.setAttribute("cx", String(x));
            fullDot.setAttribute("cy", String(y));
            fullDot.setAttribute("r", "1.45");

            frequencyPlot.reconstructionLayer.append(fullStem, fullDot);

            if (activeBins.has(index)) {
                const keptStem = createSvgElement("line", "dft-widget-kept-stem");
                setLine(keptStem, x, FREQ_BASELINE_Y, x, y);

                const keptDot = createSvgElement("circle", "dft-widget-kept-dot");
                keptDot.setAttribute("cx", String(x));
                keptDot.setAttribute("cy", String(y));
                keptDot.setAttribute("r", "2");

                frequencyPlot.signalLayer.append(keptStem, keptDot);
            }
        });
    }

    function handleDocumentPointerMove(event) {
        if (draggingIndex === null) {
            return;
        }

        updateDraggedSample(event);
    }

    function handleDocumentPointerUp(event) {
        if (draggingIndex === null) {
            return;
        }

        updateDraggedSample(event);
        draggingIndex = null;
        emitState();
    }

    function updateDraggedSample(event) {
        if (draggingIndex === null) {
            return;
        }

        const point = timePlot.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const svgPoint = point.matrixTransform(timePlot.svg.getScreenCTM().inverse());
        updateSample(draggingIndex, timeYToValue(svgPoint.y, maxAmplitude), false);
    }

    function updateSample(index, value, shouldEmit) {
        const samples = [...state.samples];
        samples[index] = Number(clamp(value, -maxAmplitude, maxAmplitude).toFixed(3));
        state = { ...state, preset: "custom", samples };
        sync();

        if (shouldEmit) {
            emitState();
        }
    }

    function sync() {
        state.keptBins = clamp(Math.round(Number.parseFloat(state.keptBins) || 0), 0, maxKeptBins);
        state.samples = state.samples.map((value) => clamp(Number.parseFloat(value) || 0, -maxAmplitude, maxAmplitude));
        keepSlider.value = String(state.keptBins);
        keepValue.textContent = String(state.keptBins);

        for (const [preset, button] of presetButtons) {
            const selected = preset === state.preset;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        }

        const coefficients = dft(state.samples);
        const reconstruction = inverseDft(coefficients, state.keptBins);
        const magnitudes = coefficients.map((coefficient) => coefficient.magnitude);

        renderTimePlot(reconstruction);
        renderFrequencyPlot(magnitudes);

        const strongestBin = magnitudes
            .map((magnitude, index) => ({ magnitude, index }))
            .slice(1)
            .sort((a, b) => b.magnitude - a.magnitude)[0];

        output.textContent = strongestBin
            ? `The strongest nonzero bin is ${strongestBin.index}, with magnitude ${formatNumber(strongestBin.magnitude)}.`
            : "The signal is mostly flat, so almost everything lives in bin 0.";
    }

    function check() {
        const coefficients = dft(state.samples);
        const magnitudes = coefficients.map((coefficient) => coefficient.magnitude);
        const nonzeroEnergy = magnitudes.slice(1).reduce((sum, magnitude) => sum + magnitude, 0);

        if (nonzeroEnergy < 0.2) {
            return {
                correct: false,
                message: "Try dragging the signal into a less flat shape so the nonzero frequency bins have something to show."
            };
        }

        if (state.keptBins >= 2) {
            return {
                correct: true,
                message: "Good: the DFT magnitudes expose which circular rhythms are present, and keeping paired bins reconstructs the visible shape."
            };
        }

        return {
            correct: false,
            message: "Now raise the kept-bins slider so the reconstruction can use more than the average level."
        };
    }

    function handleKeepInput() {
        state = {
            ...state,
            keptBins: clamp(Math.round(Number.parseFloat(keepSlider.value) || 0), 0, maxKeptBins)
        };
        sync();
        emitState();
    }

    keepSlider.addEventListener("input", handleKeepInput);
    document.addEventListener("pointermove", handleDocumentPointerMove);
    document.addEventListener("pointerup", handleDocumentPointerUp);
    document.addEventListener("pointercancel", handleDocumentPointerUp);

    sync();

    return {
        getState,
        setState,
        check,
        destroy() {
            keepSlider.removeEventListener("input", handleKeepInput);
            document.removeEventListener("pointermove", handleDocumentPointerMove);
            document.removeEventListener("pointerup", handleDocumentPointerUp);
            document.removeEventListener("pointercancel", handleDocumentPointerUp);
        }
    };
}
