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
    const sampleCount = 80;

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

export function createWidget(container, params, api = {}) {
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
    nInput.max = String(Number.isFinite(params.maxN) ? params.maxN : 50);
    nInput.step = "1";

    epsilonLabel.appendChild(epsilonInput);
    nLabel.appendChild(nInput);
    controls.append(epsilonLabel, nLabel);

    const output = document.createElement("p");
    output.className = "widget-output";
    const checkButton = document.createElement("button");
    checkButton.type = "button";
    checkButton.textContent = "Check";

    function emitState() {
        if (typeof api.onStateChange === "function") {
            api.onStateChange(getState());
        }
    }

    function syncOutput() {
        const domain = Array.isArray(params.domain) ? params.domain : [0, 0.999];
        output.textContent = `Checking f_n(x)=x^n on [${formatNumber(domain[0])}, ${formatNumber(domain[1])}] with epsilon=${formatNumber(state.epsilon)} and N=${state.N}.`;
    }

    function syncInputs() {
        epsilonInput.value = String(state.epsilon);
        nInput.value = String(state.N);
        syncOutput();
    }

    function handleInput() {
        state = {
            epsilon: clamp(Number.parseFloat(epsilonInput.value) || 0.001, 0.001, 1),
            N: clamp(Math.round(Number.parseFloat(nInput.value) || 1), 1, Number.isFinite(params.maxN) ? params.maxN : 50)
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

    container.replaceChildren(controls, output, checkButton);
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
            N: clamp(Math.round(Number.parseFloat(nextState.N) || state.N), 1, Number.isFinite(params.maxN) ? params.maxN : 50)
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
