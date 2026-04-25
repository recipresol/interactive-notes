import { getWidgetFactory } from "./widgetRegistry.js";
import { renderMath } from "./math.js";

function clearElement(element) {
    element.replaceChildren();
}

function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    if (textContent !== undefined) {
        element.textContent = textContent;
    }

    return element;
}

const STEP_FADE_DURATION_MS = 160;
const FEEDBACK_POPUP_DURATION_MS = 3600;

function nextFrame() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
            resolve();
        });
    });
}

function wait(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function shouldAnimateStepTransitions() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createActionButton(label) {
    const button = createElement("button", "action-button");
    button.type = "button";
    button.setAttribute("aria-label", label);

    const face = createElement("span", "action-button-face", label);
    button.appendChild(face);

    return button;
}

function setActionButtonLabel(button, label) {
    button.setAttribute("aria-label", label);

    const face = button.querySelector(".action-button-face");
    if (face) {
        face.textContent = label;
    }
}

function createHomeLink() {
    const link = document.createElement("a");
    link.className = "back-link";
    link.href = "./";
    link.setAttribute("aria-label", "Back to lessons");
    link.innerHTML = `
        <svg class="back-link-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
    `;
    return link;
}

function createProgressBar(engine) {
    const progressBar = createElement("div", "progress-bar");
    const track = createElement("div", "progress-track");
    const trackEmpty = createElement("div", "progress-track-empty");
    const trackFill = createElement("div", "progress-track-fill");
    const nodes = createElement("div", "progress-nodes");
    const nodeElements = [];

    engine.lesson.steps.forEach((step, index) => {
        const node = createElement("span", "progress-node");
        node.setAttribute("aria-label", `Step ${index + 1}`);
        nodes.appendChild(node);
        nodeElements.push(node);
    });

    track.append(trackEmpty, trackFill, nodes);
    progressBar.append(track);

    function update() {
        const currentIndex = engine.getCurrentStepIndex();
        const totalSteps = engine.lesson.steps.length;
        const denominator = Math.max(totalSteps - 1, 1);
        const fillRatio = totalSteps > 1 ? currentIndex / denominator : 0;

        trackFill.style.width = `calc((100% - var(--progress-node-size)) * ${fillRatio})`;

        nodeElements.forEach((node, index) => {
            const step = engine.lesson.steps[index];
            node.classList.toggle("is-complete", engine.isStepComplete(step.id));
            node.classList.toggle("is-current", index === currentIndex);
            node.classList.toggle("is-visited", index < currentIndex);
        });
    }

    update();

    return {
        element: progressBar,
        update
    };
}

function renderTextStep(step, engine, rerender) {
    const body = createElement("p", "step-body", step.body);
    body.classList.add("text-step");

    return { body, mount: null };
}

function renderMultipleChoiceStep(step, engine, rerender) {
    const fragment = document.createDocumentFragment();
    const prompt = createElement("p", "step-prompt", step.prompt);
    const list = createElement("ul", "choice-list");
    const selectedAnswer = engine.getSelectedAnswer(step.id);

    function syncSelectedChoice() {
        list.querySelectorAll(".choice-label").forEach((label) => {
            const input = label.querySelector(".choice-input");
            const card = label.querySelector(".choice-card");
            if (card && input) {
                card.classList.toggle("is-selected", input.checked);
            }
        });
    }

    step.choices.forEach((choice, index) => {
        const item = createElement("li", "choice-item");
        const label = createElement("label", "choice-label");
        const input = document.createElement("input");
        const text = createElement("span", "choice-card", choice);
        input.type = "radio";
        input.name = `choice-${step.id}`;
        input.value = String(index);
        input.className = "choice-input";
        input.checked = selectedAnswer === index;
        input.addEventListener("change", () => {
            engine.setSelectedAnswer(step.id, index);
            syncSelectedChoice();
            rerender({ animate: false });
        });

        if (selectedAnswer === index) {
            text.classList.add("is-selected");
        }

        label.append(input, text);
        item.appendChild(label);
        list.appendChild(item);
    });

    function check() {
        const choiceIndex = engine.getSelectedAnswer(step.id);
        if (choiceIndex === undefined) {
            return {
                correct: false,
                message: "Choose an answer first."
            };
        }

        return {
            correct: choiceIndex === step.answer,
            message: step.explanations[choiceIndex]
        };
    }

    fragment.append(prompt, list);
    return {
        body: fragment,
        stepId: step.id,
        checkKind: "multiple_choice",
        mount: null,
        check
    };
}

function renderWidgetStep(step, engine, rerender) {
    const fragment = document.createDocumentFragment();
    const prompt = createElement("p", "step-prompt", step.prompt);
    const widgetShell = createElement("div", "widget-shell");
    let widgetInstance = null;

    function onStateChange(nextState) {
        engine.setWidgetState(step.id, nextState);
    }

    function mount() {
        const widgetFactory = getWidgetFactory(step.widget);
        if (!widgetFactory) {
            widgetShell.textContent = `Missing widget: ${step.widget}`;
            return;
        }

        widgetInstance = widgetFactory(widgetShell, step.params || {}, {
            onStateChange
        });

        const savedState = engine.getWidgetState(step.id);
        if (savedState) {
            widgetInstance.setState(savedState);
        }
    }

    fragment.append(prompt, widgetShell);

    return {
        body: fragment,
        stepId: step.id,
        checkKind: "widget",
        mount,
        check() {
            return widgetInstance && typeof widgetInstance.check === "function"
                ? widgetInstance.check()
                : null;
        },
        destroy() {
            if (widgetInstance && typeof widgetInstance.destroy === "function") {
                widgetInstance.destroy();
            }
        }
    };
}

function renderStep(step, engine, rerender) {
    if (step.type === "text") {
        return renderTextStep(step, engine, rerender);
    }

    if (step.type === "multiple_choice") {
        return renderMultipleChoiceStep(step, engine, rerender);
    }

    if (step.type === "widget") {
        return renderWidgetStep(step, engine, rerender);
    }

    return {
        body: createElement("p", null, `Unsupported step type: ${step.type}`),
        mount: null
    };
}

export function renderHomePage(root, catalog) {
    clearElement(root);

    const shell = createElement("main", "app-shell");
    const header = createElement("header", "page-header");
    header.append(
        createElement("h1", null, "Interactive Notes"),
        createElement("p", null, "Choose a lesson to open the prototype lesson engine.")
    );

    const list = createElement("ul", "catalog-list");
    for (const lesson of catalog.lessons || []) {
        const item = createElement("li", "catalog-item");
        const title = document.createElement("a");
        title.href = `?lesson=${encodeURIComponent(lesson.id)}`;
        title.textContent = lesson.title;
        item.append(
            title,
            createElement("p", null, lesson.description || "")
        );
        list.appendChild(item);
    }

    shell.append(header, list);
    root.appendChild(shell);
    renderMath(shell);
}

export function renderNotFound(root, lessonId) {
    clearElement(root);

    const shell = createElement("main", "app-shell");
    shell.append(
        createHomeLink(),
        createElement("h1", null, "Lesson not found"),
        createElement("p", null, `No lesson could be loaded for "${lessonId}".`)
    );

    root.appendChild(shell);
    renderMath(shell);
}

export function renderLessonPage(root, engine) {
    let activeStepView = null;
    let isTransitioning = false;
    let feedbackTimeout = null;
    clearElement(root);

    const page = createElement("div", "lesson-page");
    const lessonHeader = createElement("header", "lesson-nav");
    const backLinkWrap = createElement("div", "lesson-nav-back");
    const spacer = createElement("div", "lesson-nav-spacer");
    backLinkWrap.appendChild(createHomeLink());
    const progressWrap = createElement("div", "lesson-nav-progress");
    const progressBar = createProgressBar(engine);
    progressWrap.appendChild(progressBar.element);
    spacer.setAttribute("aria-hidden", "true");
    lessonHeader.append(backLinkWrap, progressWrap, spacer);

    const shell = createElement("main", "lesson-shell");

    const content = createElement("section", "minimalist-lesson");
    const contentInner = createElement("div", "minimalist-lesson-inner");
    const feedbackPopup = createElement("div", "lesson-feedback-popup");
    feedbackPopup.setAttribute("role", "status");
    feedbackPopup.setAttribute("aria-live", "polite");
    feedbackPopup.setAttribute("aria-atomic", "true");

    const actions = createElement("div", "lesson-actions");
    const backButton = createActionButton("Back");
    backButton.addEventListener("click", () => {
        if (isTransitioning) {
            return;
        }

        if (engine.goBack()) {
            updateView();
        }
    });

    const nextButton = createActionButton("Next");
    nextButton.addEventListener("click", () => {
        if (isTransitioning) {
            return;
        }

        const currentStep = engine.getCurrentStep();
        if (activeStepNeedsCheck(currentStep)) {
            const result = activeStepView.check();
            if (!result) {
                return;
            }

            applyCheckResult(currentStep, result);
            progressBar.update();
            updateActions();
            showFeedback(result);
            return;
        }

        if (engine.goNext()) {
            updateView();
        }
    });

    actions.append(backButton, nextButton);
    content.appendChild(contentInner);
    shell.append(content, feedbackPopup, actions);
    page.append(lessonHeader, shell);
    root.appendChild(page);

    function stepCallsForCheck(step) {
        return step
            && (step.type === "multiple_choice" || (step.type === "widget" && step.check !== false));
    }

    function activeStepNeedsCheck(step = engine.getCurrentStep()) {
        return stepCallsForCheck(step)
            && !engine.isStepComplete(step.id)
            && activeStepView
            && activeStepView.stepId === step.id
            && typeof activeStepView.check === "function";
    }

    function applyCheckResult(step, result) {
        if (activeStepView.checkKind === "multiple_choice") {
            engine.setCheckedAnswer(step.id, result);
            return;
        }

        if (activeStepView.checkKind === "widget") {
            engine.setWidgetCheck(step.id, result);
        }
    }

    function clearFeedbackPopup() {
        if (feedbackTimeout) {
            window.clearTimeout(feedbackTimeout);
            feedbackTimeout = null;
        }

        feedbackPopup.classList.remove("is-visible", "feedback-success", "feedback-error");
        feedbackPopup.replaceChildren();
    }

    function showFeedback(feedback) {
        if (!feedback || !feedback.message) {
            clearFeedbackPopup();
            return;
        }

        if (feedbackTimeout) {
            window.clearTimeout(feedbackTimeout);
        }

        feedbackPopup.classList.remove("feedback-success", "feedback-error");
        feedbackPopup.classList.add("is-visible");
        if (feedback.correct || feedback.tone === "success") {
            feedbackPopup.classList.add("feedback-success");
        } else if (feedback.tone === "error" || feedback.correct === false) {
            feedbackPopup.classList.add("feedback-error");
        }
        feedbackPopup.replaceChildren(createElement("p", null, feedback.message));
        renderMath(feedbackPopup);

        feedbackTimeout = window.setTimeout(() => {
            clearFeedbackPopup();
        }, FEEDBACK_POPUP_DURATION_MS);
    }

    function updateStepContent() {
        if (activeStepView && typeof activeStepView.destroy === "function") {
            activeStepView.destroy();
        }

        const currentStep = engine.getCurrentStep();
        activeStepView = renderStep(currentStep, engine, updateView);

        clearElement(contentInner);
        clearFeedbackPopup();

        contentInner.appendChild(activeStepView.body);

        if (typeof activeStepView.mount === "function") {
            activeStepView.mount();
        }

        renderMath(contentInner);
    }

    function updateActions() {
        const currentStep = engine.getCurrentStep();
        backButton.disabled = !engine.canGoBack();
        setActionButtonLabel(nextButton, activeStepNeedsCheck(currentStep) ? "Check" : "Next");
        nextButton.disabled = activeStepNeedsCheck(currentStep) ? false : !engine.canGoNext();
    }

    async function updateView(options = {}) {
        const { animate = true, feedback = null } = options;

        if (isTransitioning) {
            return;
        }

        const shouldAnimate = animate && shouldAnimateStepTransitions();

        if (shouldAnimate) {
            isTransitioning = true;
            updateActions();
            contentInner.classList.add("is-transitioning");
            await nextFrame();
            contentInner.classList.add("is-hidden");
            await wait(STEP_FADE_DURATION_MS);
        }

        progressBar.update();
        updateStepContent();

        if (shouldAnimate) {
            await nextFrame();
            contentInner.classList.remove("is-hidden");
            await wait(STEP_FADE_DURATION_MS);
            contentInner.classList.remove("is-transitioning");
            isTransitioning = false;
        }

        updateActions();
        if (feedback) {
            showFeedback(feedback);
        }
    }

    updateView({ animate: false });
}
