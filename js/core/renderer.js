import { getWidgetFactory } from "./widgetRegistry.js";

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

function renderFeedback(step, engine) {
    const feedback = engine.getFeedback(step.id);
    const message = createElement("p", "feedback-message");

    if (!feedback) {
        return message;
    }

    message.textContent = feedback.message;
    if (feedback.tone === "success") {
        message.classList.add("feedback-success");
    } else if (feedback.tone === "error") {
        message.classList.add("feedback-error");
    }

    return message;
}

function renderTextStep(step, engine, rerender) {
    const wrapper = document.createElement("div");
    const body = createElement("p", "step-body", step.body);
    const affordance = createElement("p", "step-affordance", "Use Next to continue.");

    wrapper.append(body, affordance);
    wrapper.className = "text-step";

    return { body: wrapper, mount: null };
}

function renderMultipleChoiceStep(step, engine, rerender) {
    const wrapper = document.createElement("div");
    const prompt = createElement("p", "step-prompt", step.prompt);
    const list = createElement("ul", "choice-list");
    const selectedAnswer = engine.getSelectedAnswer(step.id);

    step.choices.forEach((choice, index) => {
        const item = createElement("li", "choice-item");
        const label = createElement("label", "choice-label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `choice-${step.id}`;
        input.value = String(index);
        input.checked = selectedAnswer === index;
        input.addEventListener("change", () => {
            engine.setSelectedAnswer(step.id, index);
            rerender();
        });

        label.append(input, document.createTextNode(choice));
        item.appendChild(label);
        list.appendChild(item);
    });

    function checkAnswer() {
        const choiceIndex = engine.getSelectedAnswer(step.id);
        if (choiceIndex === undefined) {
            return;
        }

        const result = {
            correct: choiceIndex === step.answer,
            message: step.explanations[choiceIndex]
        };
        engine.setCheckedAnswer(step.id, result);
        rerender();
    }

    list.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", checkAnswer);
    });

    wrapper.append(prompt, list);
    return { body: wrapper, mount: null };
}

function renderHints(step) {
    if (!Array.isArray(step.hints) || step.hints.length === 0) {
        return null;
    }

    const hintTitle = createElement("p", null, "Hints");
    const hintList = createElement("ul", "hint-list");
    for (const hint of step.hints) {
        hintList.appendChild(createElement("li", null, hint));
    }

    const wrapper = document.createElement("div");
    wrapper.append(hintTitle, hintList);
    return wrapper;
}

function renderWidgetStep(step, engine, rerender) {
    const wrapper = document.createElement("div");
    const prompt = createElement("p", "step-prompt", step.prompt);
    const widgetShell = createElement("div", "widget-shell");
    const hints = renderHints(step);
    let widgetInstance = null;

    function onStateChange(nextState) {
        engine.setWidgetState(step.id, nextState);
    }

    function onCheck(result) {
        engine.setWidgetCheck(step.id, result);
        rerender();
    }

    function mount() {
        const widgetFactory = getWidgetFactory(step.widget);
        if (!widgetFactory) {
            widgetShell.textContent = `Missing widget: ${step.widget}`;
            return;
        }

        widgetInstance = widgetFactory(widgetShell, step.params || {}, {
            onStateChange,
            onCheck
        });

        const savedState = engine.getWidgetState(step.id);
        if (savedState) {
            widgetInstance.setState(savedState);
        }
    }

    wrapper.append(prompt, widgetShell);
    if (hints) {
        wrapper.appendChild(hints);
    }

    return {
        body: wrapper,
        mount,
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
}

export function renderLessonPage(root, engine) {
    let activeStepView = null;
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

    const shell = createElement("main", "app-shell");
    shell.classList.add("lesson-shell");

    const content = createElement("section", "step-panel minimalist-lesson");
    const feedbackSlot = createElement("div", "feedback-slot");

    const actions = createElement("div", "lesson-actions");
    const backButton = createElement("button", null, "Back");
    backButton.type = "button";
    backButton.addEventListener("click", () => {
        if (engine.goBack()) {
            updateView();
        }
    });

    const nextButton = createElement("button", null, "Next");
    nextButton.type = "button";
    nextButton.addEventListener("click", () => {
        if (engine.goNext()) {
            updateView();
        }
    });

    actions.append(backButton, nextButton);
    shell.append(content, actions);
    page.append(lessonHeader, shell);
    root.appendChild(page);

    function updateStepContent() {
        if (activeStepView && typeof activeStepView.destroy === "function") {
            activeStepView.destroy();
        }

        const currentStep = engine.getCurrentStep();
        activeStepView = renderStep(currentStep, engine, updateView);

        clearElement(content);
        clearElement(feedbackSlot);

        content.appendChild(activeStepView.body);
        feedbackSlot.appendChild(renderFeedback(currentStep, engine));
        content.appendChild(feedbackSlot);

        if (typeof activeStepView.mount === "function") {
            activeStepView.mount();
        }
    }

    function updateActions() {
        backButton.disabled = !engine.canGoBack();
        nextButton.disabled = !engine.canGoNext();
    }

    function updateView() {
        progressBar.update();
        updateActions();
        updateStepContent();
    }

    updateView();
}
