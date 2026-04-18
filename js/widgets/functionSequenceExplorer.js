function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatNumber(value) {
    return Number(value).toFixed(3);
}

function sampleWitness(params, epsilon, startN) {
    const domain = Array.isArray(params.domain) ? params.domain : [0, 0.999];
    const maxN = Number.isFinite(params.maxN) ? params.maxN : 50;
    const upperN = Math.min(maxN, startN + 12);
    const sampleCount = 100;

    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        const x = domain[0] + ((domain[1] - domain[0]) * sampleIndex) / sampleCount;
        for (let n = startN; n <= upperN; n += 1) {
            const value = x ** n;
            if (value >= epsilon) {
                return { x, n, value };
            }
        }
    }

    return null;
}

function toGraphPoint(x, y, domain, width, height, padding) {
    const [minX, maxX] = domain;
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    const px = padding.left + ((x - minX) / (maxX - minX)) * graphWidth;
    const py = padding.top + (1 - y) * graphHeight;
    return [px, py];
}

function buildPathForN(n, domain, width, height, padding) {
    const sampleCount = 80;
    const [minX, maxX] = domain;
    let path = "";

    for (let i = 0; i <= sampleCount; i += 1) {
        const x = minX + ((maxX - minX) * i) / sampleCount;
        const y = clamp(x ** n, 0, 1);
        const [px, py] = toGraphPoint(x, y, domain, width, height, padding);
        path += `${i === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)} `;
    }

    return path.trim();
}

export function createWidget(container, params, api = {}) {
    const maxN = Number.isFinite(params.maxN) ? params.maxN : 50;
    const domain = Array.isArray(params.domain) ? params.domain : [0, 0.999];

    let state = {
        epsilon: Number.isFinite(params.initialEpsilon) ? params.initialEpsilon : 0.2,
        N: Number.isFinite(params.initialN) ? params.initialN : 8
    };

    const controls = document.createElement("div");
    controls.className = "widget-controls";

    const epsilonLabel = document.createElement("label");
    epsilonLabel.textContent = "epsilon";
    const epsilonInput = document.createElement("input");
    epsilonInput.type = "number";
    epsilonInput.min = "0.001";
    epsilonInput.max = "1";
    epsilonInput.step = "0.01";

    const nLabel = document.createElement("label");
    nLabel.textContent = "N";
    const nInput = document.createElement("input");
    nInput.type = "number";
    nInput.min = "1";
    nInput.max = String(maxN);
    nInput.step = "1";

    epsilonLabel.appendChild(epsilonInput);
    nLabel.appendChild(nInput);
    controls.append(epsilonLabel, nLabel);

    const graph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    graph.setAttribute("class", "function-sequence-graph");
    graph.setAttribute("viewBox", "0 0 640 360");
    graph.setAttribute("role", "img");
    graph.setAttribute("aria-label", "Graph of several functions from the sequence f_n(x)=x^n");

    const graphStatus = document.createElement("p");
    graphStatus.className = "widget-output";

    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.textContent = "Check";

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function renderGraph() {
        const width = 640;
        const height = 360;
        const padding = { top: 26, right: 20, bottom: 36, left: 46 };
        const witness = sampleWitness(params, state.epsilon, state.N);

        const nValues = [
            state.N,
            clamp(state.N + 4, 1, maxN),
            clamp(state.N + 8, 1, maxN),
            clamp(state.N + 12, 1, maxN)
        ].filter((value, index, source) => source.indexOf(value) === index);

        const paths = nValues
            .map((n, index) => {
                const path = buildPathForN(n, domain, width, height, padding);
                return `<path class=\"function-sequence-curve curve-${index + 1}\" d=\"${path}\"></path>`;
            })
            .join("");

        const epsilonPoints = [
            toGraphPoint(domain[0], state.epsilon, domain, width, height, padding),
            toGraphPoint(domain[1], state.epsilon, domain, width, height, padding)
        ];

        const axisLeft = padding.left;
        const axisRight = width - padding.right;
        const axisTop = padding.top;
        const axisBottom = height - padding.bottom;

        const ticksY = [0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const [, py] = toGraphPoint(domain[0], tick, domain, width, height, padding);
            return `<g class=\"graph-tick graph-tick-y\"><line x1=\"${axisLeft}\" y1=\"${py.toFixed(2)}\" x2=\"${axisRight}\" y2=\"${py.toFixed(2)}\"></line><text x=\"${axisLeft - 8}\" y=\"${(py + 4).toFixed(2)}\">${formatNumber(tick)}</text></g>`;
        });

        const ticksX = [domain[0], (domain[0] + domain[1]) / 2, domain[1]].map((tick) => {
            const [px] = toGraphPoint(tick, 0, domain, width, height, padding);
            return `<g class="graph-tick graph-tick-x"><line x1="${px.toFixed(2)}" y1="${axisTop}" x2="${px.toFixed(2)}" y2="${axisBottom}"></line><text x="${px.toFixed(2)}" y="${height - 12}">${formatNumber(tick)}</text></g>`;
        });

        let witnessMarkup = "";
        if (witness) {
            const [wx, wy] = toGraphPoint(witness.x, witness.value, domain, width, height, padding);
            const [wxBottom] = toGraphPoint(witness.x, 0, domain, width, height, padding);
            witnessMarkup = `<line class=\"witness-line\" x1=\"${wxBottom.toFixed(2)}\" y1=\"${axisBottom}\" x2=\"${wxBottom.toFixed(2)}\" y2=\"${wy.toFixed(2)}\"></line><circle class=\"witness-point\" cx=\"${wx.toFixed(2)}\" cy=\"${wy.toFixed(2)}\" r=\"5\"></circle>`;
        }

        graph.innerHTML = `
            <rect class="graph-frame" x="${axisLeft}" y="${axisTop}" width="${axisRight - axisLeft}" height="${axisBottom - axisTop}"></rect>
            ${ticksY.join("")}
            ${ticksX.join("")}
            <line class="epsilon-line" x1="${epsilonPoints[0][0].toFixed(2)}" y1="${epsilonPoints[0][1].toFixed(2)}" x2="${epsilonPoints[1][0].toFixed(2)}" y2="${epsilonPoints[1][1].toFixed(2)}"></line>
            ${paths}
            ${witnessMarkup}
            <text class="axis-label" x="${width / 2}" y="${height - 2}">x</text>
            <text class="axis-label" x="14" y="${height / 2}" transform="rotate(-90 14 ${height / 2})">f_n(x)</text>
            <g class="graph-legend" transform="translate(${axisLeft + 12}, ${axisTop + 18})">
                <text x="0" y="0">Plotted n values: ${nValues.join(", ")}</text>
                <text x="0" y="18">epsilon = ${formatNumber(state.epsilon)}</text>
            </g>
        `;

        if (witness) {
            graphStatus.textContent = `A sampled counterexample appears near x=${formatNumber(witness.x)}: for n=${witness.n}, x^n=${formatNumber(witness.value)} is still above epsilon.`;
            return;
        }

        graphStatus.textContent = `No sampled counterexample was found for n in [${state.N}, ${Math.min(maxN, state.N + 12)}], but this finite check is not a proof of uniform convergence.`;
    }

    function syncInputs() {
        epsilonInput.value = String(state.epsilon);
        nInput.value = String(state.N);
        renderGraph();
    }

    function handleInput() {
        state = {
            epsilon: clamp(Number.parseFloat(epsilonInput.value) || 0.001, 0.001, 1),
            N: clamp(Math.round(Number.parseFloat(nInput.value) || 1), 1, maxN)
        };
        syncInputs();
        emitState();
    }

    epsilonInput.addEventListener("input", handleInput);
    nInput.addEventListener("input", handleInput);
    checkButton.addEventListener("click", () => {
        if (typeof api.onCheck === "function") {
            api.onCheck(check());
        }
    });

    container.replaceChildren(controls, graph, graphStatus, checkButton);
    syncInputs();

    function getState() {
        return { ...state };
    }

    function setState(nextState) {
        if (!nextState || typeof nextState !== "object") {
            return;
        }

        state = {
            epsilon: clamp(Number.parseFloat(nextState.epsilon) || state.epsilon, 0.001, 1),
            N: clamp(Math.round(Number.parseFloat(nextState.N) || state.N), 1, maxN)
        };
        syncInputs();
    }

    function check() {
        const witness = sampleWitness(params, state.epsilon, state.N);

        if (witness) {
            return {
                correct: false,
                message: `Sampled witness found: x=${formatNumber(witness.x)} and n=${witness.n} give x^n=${formatNumber(witness.value)}, so points near 1 still cause trouble.`
            };
        }

        return {
            correct: true,
            message: "This finite sampled check passed for your epsilon and N, though it is not a proof of uniform convergence."
        };
    }

    function destroy() {
        epsilonInput.removeEventListener("input", handleInput);
        nInput.removeEventListener("input", handleInput);
    }

    return {
        getState,
        setState,
        check,
        destroy
    };
}
