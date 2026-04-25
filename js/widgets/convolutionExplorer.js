import { clamp, formatNumber, renderKatex } from "./shared.js";

function sanitizeVector(values, fallback) {
    const source = Array.isArray(values) && values.length > 0 ? values : fallback;
    return source.map((value) => clamp(Number.parseFloat(value) || 0, -1.2, 1.2));
}

function convolveSame(signal, kernel) {
    return signal.map((sample, index) => {
        let sum = 0;

        for (let tap = 0; tap < kernel.length; tap += 1) {
            const signalIndex = index - tap;
            if (signalIndex >= 0 && signalIndex < signal.length) {
                sum += signal[signalIndex] * kernel[tap];
            }
        }

        return sum;
    });
}

const DEFAULT_SIGNAL = [0.1, 0.75, 1, 0.35, -0.25, 0.55, 0.25, 0];
const DEFAULT_KERNEL = [0.25, 0.5, 0.25];
const MAX_VALUE = 1.2;

export function createWidget(container, params, api = {}) {
    let dragging = null;
    let state = {
        selectedIndex: Number.isInteger(params.initialIndex) ? params.initialIndex : 3,
        signal: sanitizeVector(params.signal, DEFAULT_SIGNAL),
        kernel: sanitizeVector(params.kernel, DEFAULT_KERNEL)
    };

    const widget = document.createElement("div");
    widget.className = "convolution-widget";
    widget.style.setProperty("--convolution-count", String(state.signal.length));
    widget.style.setProperty("--convolution-kernel-count", String(state.kernel.length));

    const stack = document.createElement("div");
    stack.className = "convolution-stack";

    const rows = {
        index: createRow("n"),
        signal: createRow("x[k]"),
        kernel: createRow("h[n-k]"),
        products: createRow("x[k]h[n-k]"),
        output: createRow("y[n]")
    };

    stack.append(
        rows.index.element,
        rows.signal.element,
        rows.kernel.element,
        rows.products.element,
        rows.output.element
    );

    const kernelEditor = document.createElement("div");
    kernelEditor.className = "convolution-kernel-editor";
    const kernelLabel = document.createElement("div");
    kernelLabel.className = "convolution-kernel-label";
    renderKatex(kernelLabel, "h[j]");
    const kernelCells = document.createElement("div");
    kernelCells.className = "convolution-kernel-cells";
    kernelEditor.append(kernelLabel, kernelCells);

    const output = document.createElement("p");
    output.className = "widget-output convolution-output";

    widget.append(stack, kernelEditor, output);
    container.replaceChildren(widget);

    function createRow(labelExpression) {
        const element = document.createElement("div");
        element.className = "convolution-row";

        const label = document.createElement("div");
        label.className = "convolution-row-label";
        renderKatex(label, labelExpression);

        const cells = document.createElement("div");
        cells.className = "convolution-row-cells";

        element.append(cells, label);
        return { element, cells };
    }

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function getState() {
        return {
            selectedIndex: state.selectedIndex,
            signal: [...state.signal],
            kernel: [...state.kernel]
        };
    }

    function setState(nextState) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }

        state = {
            selectedIndex: Number.isInteger(nextState.selectedIndex)
                ? clamp(nextState.selectedIndex, 0, state.signal.length - 1)
                : state.selectedIndex,
            signal: sanitizeVector(nextState.signal, state.signal),
            kernel: sanitizeVector(nextState.kernel, state.kernel)
        };
        sync();
    }

    function tapForSignalIndex(signalIndex) {
        const tap = state.selectedIndex - signalIndex;
        return tap >= 0 && tap < state.kernel.length ? tap : null;
    }

    function renderIndexCell(index) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "convolution-index-cell";
        cell.setAttribute("aria-label", `Select output ${index}`);
        cell.setAttribute("aria-pressed", index === state.selectedIndex ? "true" : "false");
        renderKatex(cell, String(index));

        if (index === state.selectedIndex) {
            cell.classList.add("is-selected");
        }

        cell.addEventListener("click", () => {
            state = { ...state, selectedIndex: index };
            sync();
            emitState();
        });

        return cell;
    }

    function renderValueCell(value, options = {}) {
        const cell = document.createElement("div");
        cell.className = "convolution-cell";

        if (options.selected) {
            cell.classList.add("is-selected");
        }
        if (options.inWindow) {
            cell.classList.add("is-in-window");
        }
        if (options.muted) {
            cell.classList.add("is-muted");
        }
        if (value < 0) {
            cell.classList.add("is-negative");
        }
        if (options.draggable) {
            cell.classList.add("is-draggable");
            cell.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                dragging = options.dragTarget;
                updateDraggedValue(event);
            });
        }

        const valueLabel = document.createElement("span");
        valueLabel.className = "convolution-cell-value";
        valueLabel.textContent = formatNumber(value);

        const baseline = document.createElement("span");
        baseline.className = "convolution-baseline";

        const stem = document.createElement("span");
        stem.className = "convolution-stem";
        stem.style.height = `${Math.max(4, Math.abs(value) / MAX_VALUE * 42)}%`;

        cell.append(valueLabel, baseline, stem);
        return cell;
    }

    function renderKernelEditorCell(value, tap) {
        const cell = renderValueCell(value, {
            draggable: true,
            dragTarget: { kind: "kernel", index: tap },
            selected: true
        });
        cell.classList.add("convolution-kernel-editor-cell");

        const label = document.createElement("span");
        label.className = "convolution-tap-label";
        renderKatex(label, String(tap));
        cell.appendChild(label);

        return cell;
    }

    function renderCells(row, cells) {
        row.cells.replaceChildren(...cells);
    }

    function sync() {
        state.selectedIndex = clamp(Math.round(Number.parseFloat(state.selectedIndex) || 0), 0, state.signal.length - 1);
        const outputSamples = convolveSame(state.signal, state.kernel);
        const products = state.signal.map((sample, index) => {
            const tap = tapForSignalIndex(index);
            return tap === null ? 0 : sample * state.kernel[tap];
        });

        renderCells(rows.index, state.signal.map((sample, index) => renderIndexCell(index)));
        renderCells(rows.signal, state.signal.map((sample, index) => renderValueCell(sample, {
            selected: index === state.selectedIndex,
            inWindow: tapForSignalIndex(index) !== null,
            draggable: true,
            dragTarget: { kind: "signal", index }
        })));
        renderCells(rows.kernel, state.signal.map((sample, index) => {
            const tap = tapForSignalIndex(index);
            return renderValueCell(tap === null ? 0 : state.kernel[tap], {
                selected: index === state.selectedIndex,
                inWindow: tap !== null,
                muted: tap === null
            });
        }));
        renderCells(rows.products, products.map((product, index) => renderValueCell(product, {
            selected: index === state.selectedIndex,
            inWindow: tapForSignalIndex(index) !== null,
            muted: tapForSignalIndex(index) === null
        })));
        renderCells(rows.output, outputSamples.map((sample, index) => renderValueCell(sample, {
            selected: index === state.selectedIndex
        })));

        kernelCells.replaceChildren(...state.kernel.map((value, tap) => renderKernelEditorCell(value, tap)));
        renderKatex(output, `y[${state.selectedIndex}]=${formatNumber(outputSamples[state.selectedIndex])}`);
    }

    function valueFromPointer(event, element) {
        const rect = element.getBoundingClientRect();
        const ratio = (rect.top + rect.height / 2 - event.clientY) / (rect.height * 0.42);
        return clamp(ratio * MAX_VALUE, -MAX_VALUE, MAX_VALUE);
    }

    function getDragElement() {
        if (!dragging) {
            return null;
        }

        if (dragging.kind === "signal") {
            return rows.signal.cells.children[dragging.index] || null;
        }

        return kernelCells.children[dragging.index] || null;
    }

    function updateDraggedValue(event) {
        if (!dragging) {
            return;
        }

        const target = getDragElement();
        if (!target) {
            return;
        }

        const nextValue = Number(valueFromPointer(event, target).toFixed(2));
        if (dragging.kind === "signal") {
            const signal = [...state.signal];
            signal[dragging.index] = nextValue;
            state = { ...state, signal };
        } else {
            const kernel = [...state.kernel];
            kernel[dragging.index] = nextValue;
            state = { ...state, kernel };
        }
        sync();
    }

    function handleDocumentPointerMove(event) {
        if (dragging) {
            updateDraggedValue(event);
        }
    }

    function handleDocumentPointerUp(event) {
        if (!dragging) {
            return;
        }

        updateDraggedValue(event);
        dragging = null;
        emitState();
    }

    function check() {
        const products = state.signal.map((sample, index) => {
            const tap = tapForSignalIndex(index);
            return tap === null ? 0 : sample * state.kernel[tap];
        });
        const selectedSum = products.reduce((sum, value) => sum + value, 0);
        const computed = convolveSame(state.signal, state.kernel)[state.selectedIndex];

        if (Math.abs(selectedSum - computed) < 0.001) {
            return {
                correct: true,
                message: `Right: the visible products sum to $y[${state.selectedIndex}]$.`
            };
        }

        return {
            correct: false,
            message: "The selected output should match the sum of the visible products."
        };
    }

    document.addEventListener("pointermove", handleDocumentPointerMove);
    document.addEventListener("pointerup", handleDocumentPointerUp);
    document.addEventListener("pointercancel", handleDocumentPointerUp);

    sync();

    return {
        getState,
        setState,
        check,
        destroy() {
            document.removeEventListener("pointermove", handleDocumentPointerMove);
            document.removeEventListener("pointerup", handleDocumentPointerUp);
            document.removeEventListener("pointercancel", handleDocumentPointerUp);
        }
    };
}
