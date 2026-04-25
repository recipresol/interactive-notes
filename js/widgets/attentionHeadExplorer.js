function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 2) {
    return Number(value).toFixed(digits);
}

function dot(a, b) {
    return (a[0] * b[0]) + (a[1] * b[1]);
}

function addScaled(sum, vector, scale) {
    return [
        sum[0] + (vector[0] * scale),
        sum[1] + (vector[1] * scale)
    ];
}

function applyMatrix(matrix, vector) {
    return [
        (matrix[0][0] * vector[0]) + (matrix[0][1] * vector[1]),
        (matrix[1][0] * vector[0]) + (matrix[1][1] * vector[1])
    ];
}

function softmax(values) {
    const maxValue = Math.max(...values);
    const exponentials = values.map((value) => Math.exp(value - maxValue));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    return exponentials.map((value) => value / total);
}

function getTokens(params) {
    if (Array.isArray(params.tokens) && params.tokens.length > 0) {
        return params.tokens.map((token, index) => ({
            label: token.label || String(index),
            vector: Array.isArray(token.vector) ? token.vector.slice(0, 2) : [0, 0]
        }));
    }

    return [
        { label: "0", vector: [0.85, 0.1] },
        { label: "1", vector: [0.25, 0.9] },
        { label: "2", vector: [-0.35, 0.65] },
        { label: "3", vector: [-0.75, -0.15] }
    ];
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

const SVG_NS = "http://www.w3.org/2000/svg";
const BOX_VIEWBOX = 64;
const BOX_SCALE = 20;
const MATRIX_SCALE = 20;
const MATRIX_NAMES = ["Q", "K", "V"];

function createSvgElement(tagName, className) {
    const element = document.createElementNS(SVG_NS, tagName);

    if (className) {
        element.setAttribute("class", className);
    }

    return element;
}

function setLine(line, x1, y1, x2, y2) {
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
}

function toBoxPoint(vector, scale = BOX_SCALE) {
    return [
        BOX_VIEWBOX / 2 + (vector[0] * scale),
        BOX_VIEWBOX / 2 - (vector[1] * scale)
    ];
}

function fromBoxPoint(x, y, scale = MATRIX_SCALE) {
    return [
        clamp((x - BOX_VIEWBOX / 2) / scale, -1.45, 1.45),
        clamp((BOX_VIEWBOX / 2 - y) / scale, -1.45, 1.45)
    ];
}

function matrixColumn(matrix, columnIndex) {
    return [matrix[0][columnIndex], matrix[1][columnIndex]];
}

function setMatrixColumn(matrix, columnIndex, vector) {
    matrix[0][columnIndex] = vector[0];
    matrix[1][columnIndex] = vector[1];
}

function cloneMatrix(matrix) {
    return matrix.map((row) => [...row]);
}

function sanitizeMatrix(nextMatrix, fallback) {
    if (!Array.isArray(nextMatrix) || nextMatrix.length !== 2) {
        return cloneMatrix(fallback);
    }

    return [0, 1].map((rowIndex) => [0, 1].map((columnIndex) => (
        clamp(Number.parseFloat(nextMatrix[rowIndex] && nextMatrix[rowIndex][columnIndex]) || 0, -1.45, 1.45)
    )));
}

export function createWidget(container, params, api = {}) {
    const tokens = getTokens(params);
    let draggingBasis = null;
    let state = {
        selectedIndex: Number.isInteger(params.initialSelectedIndex)
            ? clamp(params.initialSelectedIndex, 0, tokens.length - 1)
            : 0,
        matrices: {
            Q: [[0.95, -0.2], [0.25, 0.85]],
            K: [[0.8, 0.35], [-0.25, 0.95]],
            V: [[0.75, -0.55], [0.45, 0.65]]
        }
    };

    const widget = document.createElement("div");
    widget.className = "attention-widget";
    widget.style.setProperty("--attention-count", String(tokens.length));

    const stack = document.createElement("div");
    stack.className = "attention-stack";

    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.className = "attention-check";
    checkButton.textContent = "Check";

    const output = document.createElement("p");
    output.className = "widget-output attention-output";

    const rows = {
        index: createRow("", "i", "index"),
        X: createRow("", "X", "x"),
        Q: createRow("Q", "Q", "q"),
        K: createRow("K", "K", "k"),
        scores: createRow("", "QK^\\top,\\alpha", "scores"),
        V: createRow("V", "V", "v"),
        Z: createRow("", "z", "z")
    };

    stack.append(
        rows.index.element,
        rows.X.element,
        rows.Q.element,
        rows.K.element,
        rows.scores.element,
        rows.V.element,
        rows.Z.element
    );
    widget.append(stack, checkButton, output);
    container.replaceChildren(widget);

    function createRow(matrixName, rowLabel, classKey) {
        const element = document.createElement("div");
        element.className = `attention-row attention-row-${classKey}`;

        const matrixSlot = document.createElement("div");
        matrixSlot.className = "attention-matrix-slot";

        let matrixEditor = null;
        if (matrixName) {
            matrixEditor = createMatrixEditor(matrixName);
            matrixSlot.appendChild(matrixEditor.element);
        }

        const cells = document.createElement("div");
        cells.className = "attention-row-cells";

        const label = document.createElement("div");
        label.className = "attention-row-label";
        renderKatex(label, rowLabel);

        element.append(matrixSlot, cells, label);
        return { element, matrixEditor, cells };
    }

    function createMatrixEditor(name) {
        const element = document.createElement("div");
        element.className = `attention-matrix-editor attention-matrix-editor-${name.toLowerCase()}`;

        const svg = createSvgElement("svg", "attention-matrix-svg");
        svg.setAttribute("viewBox", `0 0 ${BOX_VIEWBOX} ${BOX_VIEWBOX}`);

        const gridLayer = createSvgElement("g", "attention-matrix-grid");
        const basisLayer = createSvgElement("g", "attention-matrix-basis");
        svg.append(gridLayer, basisLayer);

        element.appendChild(svg);
        return { element, svg, gridLayer, basisLayer, name };
    }

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function getState() {
        return {
            selectedIndex: state.selectedIndex,
            matrices: {
                Q: cloneMatrix(state.matrices.Q),
                K: cloneMatrix(state.matrices.K),
                V: cloneMatrix(state.matrices.V)
            }
        };
    }

    function setState(nextState) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }

        state = {
            selectedIndex: Number.isInteger(nextState.selectedIndex)
                ? clamp(nextState.selectedIndex, 0, tokens.length - 1)
                : state.selectedIndex,
            matrices: {
                Q: sanitizeMatrix(nextState.matrices && nextState.matrices.Q, state.matrices.Q),
                K: sanitizeMatrix(nextState.matrices && nextState.matrices.K, state.matrices.K),
                V: sanitizeMatrix(nextState.matrices && nextState.matrices.V, state.matrices.V)
            }
        };
        sync();
    }

    function computeForQuery(queryIndex, projections = null) {
        const projected = projections || computeProjections();
        const query = projected.queries[queryIndex];
        const scores = projected.keys.map((key) => dot(query, key) / Math.sqrt(2));
        const weights = softmax(scores);
        const weightedSum = projected.values.reduce((sum, value, index) => addScaled(sum, value, weights[index]), [0, 0]);

        return { query, scores, weights, weightedSum };
    }

    function computeProjections() {
        const residuals = tokens.map((token) => token.vector);
        return {
            residuals,
            queries: residuals.map((vector) => applyMatrix(state.matrices.Q, vector)),
            keys: residuals.map((vector) => applyMatrix(state.matrices.K, vector)),
            values: residuals.map((vector) => applyMatrix(state.matrices.V, vector))
        };
    }

    function computeAllOutputs(projections) {
        return tokens.map((token, index) => computeForQuery(index, projections).weightedSum);
    }

    function renderMatrixEditor(editor) {
        const matrix = state.matrices[editor.name];
        editor.gridLayer.replaceChildren();
        editor.basisLayer.replaceChildren();
        renderTransformedGrid(editor.gridLayer, matrix, MATRIX_SCALE, "attention-matrix-grid-line");

        [0, 1].forEach((columnIndex) => {
            const vector = matrixColumn(matrix, columnIndex);
            const [x, y] = toBoxPoint(vector, MATRIX_SCALE);
            const classSuffix = columnIndex === 0 ? "x" : "y";

            const arrow = createSvgElement("line", `attention-matrix-basis-vector attention-matrix-basis-${classSuffix}`);
            setLine(arrow, BOX_VIEWBOX / 2, BOX_VIEWBOX / 2, x, y);

            const handle = createSvgElement("circle", `attention-matrix-handle attention-matrix-handle-${classSuffix}`);
            handle.setAttribute("cx", String(x));
            handle.setAttribute("cy", String(y));
            handle.setAttribute("r", "3.2");
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                draggingBasis = { name: editor.name, columnIndex };
                updateDraggedBasis(event);
            });

            editor.basisLayer.append(arrow, handle);
        });
    }

    function renderAxes(layer) {
        const xAxis = createSvgElement("line", "attention-mini-axis");
        setLine(xAxis, 0, BOX_VIEWBOX / 2, BOX_VIEWBOX, BOX_VIEWBOX / 2);
        const yAxis = createSvgElement("line", "attention-mini-axis");
        setLine(yAxis, BOX_VIEWBOX / 2, 0, BOX_VIEWBOX / 2, BOX_VIEWBOX);
        layer.append(xAxis, yAxis);
    }

    function renderBaseGrid(layer) {
        for (let gridIndex = -3; gridIndex <= 3; gridIndex += 1) {
            if (gridIndex === 0) {
                continue;
            }

            const offset = BOX_VIEWBOX / 2 + gridIndex * 10;
            const verticalLine = createSvgElement("line", "attention-mini-grid-line");
            setLine(verticalLine, offset, 0, offset, BOX_VIEWBOX);
            const horizontalLine = createSvgElement("line", "attention-mini-grid-line");
            setLine(horizontalLine, 0, offset, BOX_VIEWBOX, offset);
            layer.append(verticalLine, horizontalLine);
        }

        renderAxes(layer);
    }

    function renderTransformedGrid(layer, matrix, scale, lineClassName) {
        for (let gridIndex = -3; gridIndex <= 3; gridIndex += 1) {
            const offset = gridIndex / 2;
            const verticalA = applyMatrix(matrix, [offset, -2]);
            const verticalB = applyMatrix(matrix, [offset, 2]);
            const horizontalA = applyMatrix(matrix, [-2, offset]);
            const horizontalB = applyMatrix(matrix, [2, offset]);
            const className = gridIndex === 0 ? "attention-transformed-axis" : lineClassName;

            const verticalLine = createSvgElement("line", className);
            setLine(verticalLine, ...toBoxPoint(verticalA, scale), ...toBoxPoint(verticalB, scale));
            const horizontalLine = createSvgElement("line", className);
            setLine(horizontalLine, ...toBoxPoint(horizontalA, scale), ...toBoxPoint(horizontalB, scale));
            layer.append(verticalLine, horizontalLine);
        }

        renderAxes(layer);
    }

    function renderVectorCell(vector, className, options = {}) {
        const cell = document.createElement("div");
        cell.className = "attention-cell attention-vector-cell";
        if (options.faded) {
            cell.classList.add("is-faded");
        }
        if (options.selected) {
            cell.classList.add("is-selected");
        }

        const svg = createSvgElement("svg", "attention-mini-svg");
        svg.setAttribute("viewBox", `0 0 ${BOX_VIEWBOX} ${BOX_VIEWBOX}`);

        const gridLayer = createSvgElement("g", "attention-mini-grid");
        if (options.gridMatrix) {
            renderTransformedGrid(gridLayer, options.gridMatrix, BOX_SCALE, "attention-mini-grid-line");
        } else {
            renderBaseGrid(gridLayer);
        }

        if (options.underlayVector) {
            const [underlayX, underlayY] = toBoxPoint(options.underlayVector);
            const underlayArrow = createSvgElement("line", "attention-mini-arrow-underlay-query");
            setLine(underlayArrow, BOX_VIEWBOX / 2, BOX_VIEWBOX / 2, underlayX, underlayY);

            const underlayDot = createSvgElement("circle", "attention-mini-arrow-underlay-query-dot");
            underlayDot.setAttribute("cx", String(underlayX));
            underlayDot.setAttribute("cy", String(underlayY));
            underlayDot.setAttribute("r", "2.4");

            svg.append(gridLayer, underlayArrow, underlayDot);
        } else {
            svg.appendChild(gridLayer);
        }

        const [x, y] = toBoxPoint(vector);
        const arrow = createSvgElement("line", className);
        setLine(arrow, BOX_VIEWBOX / 2, BOX_VIEWBOX / 2, x, y);

        const dotElement = createSvgElement("circle", `${className}-dot`);
        dotElement.setAttribute("cx", String(x));
        dotElement.setAttribute("cy", String(y));
        dotElement.setAttribute("r", "2.4");

        svg.append(arrow, dotElement);
        cell.appendChild(svg);
        return cell;
    }

    function renderAttentionScoreCell(scoreValue, weightValue, options = {}) {
        const cell = document.createElement("div");
        cell.className = "attention-cell attention-attention-cell";
        if (options.selected) {
            cell.classList.add("is-selected");
        }

        const score = document.createElement("span");
        score.className = "attention-score-value";
        score.textContent = formatNumber(scoreValue);

        const weight = document.createElement("span");
        weight.className = "attention-weight-value";
        weight.textContent = formatNumber(weightValue);

        const bar = document.createElement("span");
        bar.className = "attention-weight-fill";
        bar.style.height = `${Math.max(5, weightValue * 100)}%`;

        cell.append(score, weight, bar);
        return cell;
    }

    function renderIndexCell(index) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "attention-index-cell";
        cell.setAttribute("aria-label", `Select position ${index}`);
        cell.setAttribute("aria-pressed", index === state.selectedIndex ? "true" : "false");
        cell.addEventListener("click", () => {
            state = {
                ...state,
                selectedIndex: index
            };
            sync();
            emitState();
        });
        renderKatex(cell, String(index));

        if (index === state.selectedIndex) {
            const marker = document.createElement("span");
            marker.className = "attention-selected-marker";
            cell.appendChild(marker);
        }

        return cell;
    }

    function renderCells(row, cells) {
        row.cells.replaceChildren(...cells);
    }

    function sync() {
        state.selectedIndex = clamp(Math.round(Number.parseFloat(state.selectedIndex) || 0), 0, tokens.length - 1);

        const projections = computeProjections();
        const selected = computeForQuery(state.selectedIndex, projections);
        const outputs = computeAllOutputs(projections);

        for (const name of MATRIX_NAMES) {
            renderMatrixEditor(rows[name].matrixEditor);
        }

        renderCells(rows.index, tokens.map((token, index) => renderIndexCell(index)));
        renderCells(rows.X, projections.residuals.map((vector, index) => renderVectorCell(vector, "attention-mini-arrow-residual", {
            selected: index === state.selectedIndex
        })));
        renderCells(rows.Q, projections.queries.map((vector, index) => renderVectorCell(vector, "attention-mini-arrow-query", {
            selected: index === state.selectedIndex,
            faded: index !== state.selectedIndex,
            gridMatrix: state.matrices.Q
        })));
        renderCells(rows.K, projections.keys.map((vector, index) => renderVectorCell(vector, "attention-mini-arrow-key", {
            selected: index === state.selectedIndex,
            gridMatrix: state.matrices.K,
            underlayVector: selected.query
        })));
        renderCells(rows.scores, selected.scores.map((score, index) => renderAttentionScoreCell(score, selected.weights[index], {
            selected: index === state.selectedIndex
        })));
        renderCells(rows.V, projections.values.map((vector, index) => renderVectorCell(vector, "attention-mini-arrow-value", {
            selected: index === state.selectedIndex,
            gridMatrix: state.matrices.V
        })));
        renderCells(rows.Z, outputs.map((vector, index) => renderVectorCell(vector, "attention-mini-arrow-sum", {
            selected: index === state.selectedIndex,
            faded: index !== state.selectedIndex,
            gridMatrix: state.matrices.V
        })));

        const topIndex = selected.weights
            .map((weight, index) => ({ weight, index }))
            .sort((a, b) => b.weight - a.weight)[0].index;
        renderKatex(output, `i=${tokens[state.selectedIndex].label}\\to j=${tokens[topIndex].label}\\quad \\alpha=${formatNumber(selected.weights[topIndex])}`);
    }

    function updateDraggedBasis(event) {
        if (!draggingBasis) {
            return;
        }

        const editor = rows[draggingBasis.name].matrixEditor;
        const point = editor.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const svgPoint = point.matrixTransform(editor.svg.getScreenCTM().inverse());
        const vector = fromBoxPoint(svgPoint.x, svgPoint.y, MATRIX_SCALE);
        const matrix = cloneMatrix(state.matrices[draggingBasis.name]);
        setMatrixColumn(matrix, draggingBasis.columnIndex, vector);
        state = {
            ...state,
            matrices: {
                ...state.matrices,
                [draggingBasis.name]: matrix
            }
        };
        sync();
    }

    function handleDocumentPointerMove(event) {
        if (draggingBasis) {
            updateDraggedBasis(event);
        }
    }

    function handleDocumentPointerUp(event) {
        if (!draggingBasis) {
            return;
        }

        updateDraggedBasis(event);
        draggingBasis = null;
        emitState();
    }

    function check() {
        const selected = computeForQuery(state.selectedIndex);
        const maxWeight = Math.max(...selected.weights);

        if (maxWeight > 0.45) {
            return {
                correct: true,
                message: "Good: one query-key match is strong enough that the value sum is pulled toward that token's value vector."
            };
        }

        return {
            correct: false,
            message: "Try dragging Q or K basis vectors until one query-key dot product stands out after softmax."
        };
    }

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
            document.removeEventListener("pointermove", handleDocumentPointerMove);
            document.removeEventListener("pointerup", handleDocumentPointerUp);
            document.removeEventListener("pointercancel", handleDocumentPointerUp);
        }
    };
}
