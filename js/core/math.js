function getMathRenderer() {
    return typeof window.renderMathInElement === "function"
        ? window.renderMathInElement
        : null;
}

export function renderMath(element) {
    if (!element) {
        return;
    }

    const renderMathInElement = getMathRenderer();
    if (!renderMathInElement) {
        return;
    }

    renderMathInElement(element, {
        delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
    });
}
