import { loadProgress, saveProgress } from "./progressStore.js";

function getDefaultState(lesson) {
    return {
        currentStepIndex: 0,
        completedStepIds: [],
        selectedAnswers: {},
        checkedAnswers: {},
        widgetStates: {},
        widgetChecks: {},
        feedbackByStepId: {}
    };
}

function sanitizeProgress(lesson, savedProgress) {
    const defaultState = getDefaultState(lesson);

    if (!savedProgress || typeof savedProgress !== "object") {
        return defaultState;
    }

    const validStepIds = new Set(lesson.steps.map((step) => step.id));
    const currentStepIndex = Number.isInteger(savedProgress.currentStepIndex)
        ? Math.min(Math.max(savedProgress.currentStepIndex, 0), lesson.steps.length - 1)
        : 0;

    const completedStepIds = Array.isArray(savedProgress.completedStepIds)
        ? savedProgress.completedStepIds.filter((stepId) => validStepIds.has(stepId))
        : [];

    return {
        currentStepIndex,
        completedStepIds,
        selectedAnswers: savedProgress.selectedAnswers && typeof savedProgress.selectedAnswers === "object"
            ? savedProgress.selectedAnswers
            : {},
        checkedAnswers: savedProgress.checkedAnswers && typeof savedProgress.checkedAnswers === "object"
            ? savedProgress.checkedAnswers
            : {},
        widgetStates: savedProgress.widgetStates && typeof savedProgress.widgetStates === "object"
            ? savedProgress.widgetStates
            : {},
        widgetChecks: savedProgress.widgetChecks && typeof savedProgress.widgetChecks === "object"
            ? savedProgress.widgetChecks
            : {},
        feedbackByStepId: savedProgress.feedbackByStepId && typeof savedProgress.feedbackByStepId === "object"
            ? savedProgress.feedbackByStepId
            : {}
    };
}

function createStepLookup(lesson) {
    return Object.fromEntries(lesson.steps.map((step, index) => [step.id, index]));
}

function canAdvanceWithoutCheck(step) {
    return step.type === "text" || (step.type === "widget" && step.check === false);
}

export function createLessonEngine(lesson) {
    const stepLookup = createStepLookup(lesson);
    const state = sanitizeProgress(lesson, loadProgress(lesson.id));

    function persist() {
        saveProgress(lesson.id, state);
    }

    function getCurrentStep() {
        return lesson.steps[state.currentStepIndex];
    }

    function isStepComplete(stepId) {
        return state.completedStepIds.includes(stepId);
    }

    function markStepComplete(stepId) {
        if (!isStepComplete(stepId)) {
            state.completedStepIds.push(stepId);
        }
    }

    function getSelectedAnswer(stepId) {
        return state.selectedAnswers[stepId];
    }

    function setSelectedAnswer(stepId, choiceIndex) {
        state.selectedAnswers[stepId] = choiceIndex;
        persist();
    }

    function getCheckedAnswer(stepId) {
        return state.checkedAnswers[stepId] || null;
    }

    function setCheckedAnswer(stepId, result) {
        state.checkedAnswers[stepId] = result;

        if (result.correct) {
            markStepComplete(stepId);
        }

        setFeedback(stepId, result.message, result.correct ? "success" : "error");
        persist();
    }

    function getWidgetState(stepId) {
        return state.widgetStates[stepId] || null;
    }

    function setWidgetState(stepId, widgetState) {
        state.widgetStates[stepId] = widgetState;
        persist();
    }

    function getWidgetCheck(stepId) {
        return state.widgetChecks[stepId] || null;
    }

    function setWidgetCheck(stepId, result) {
        state.widgetChecks[stepId] = result;

        if (result.correct) {
            markStepComplete(stepId);
        }

        setFeedback(stepId, result.message, result.correct ? "success" : "error");
        persist();
    }

    function setFeedback(stepId, message, tone = "neutral") {
        state.feedbackByStepId[stepId] = { message, tone };
    }

    function getFeedback(stepId) {
        return state.feedbackByStepId[stepId] || null;
    }

    function completeTextStep(stepId) {
        markStepComplete(stepId);
        persist();
    }

    function canAdvanceFromStep(step = getCurrentStep()) {
        if (canAdvanceWithoutCheck(step)) {
            return true;
        }

        return isStepComplete(step.id);
    }

    function canGoBack() {
        return state.currentStepIndex > 0;
    }

    function canGoNext() {
        return state.currentStepIndex < lesson.steps.length - 1 && canAdvanceFromStep();
    }

    function goToStep(index) {
        if (!Number.isInteger(index) || index < 0 || index >= lesson.steps.length) {
            return false;
        }

        if (index > state.currentStepIndex) {
            for (let cursor = 0; cursor < index; cursor += 1) {
                const priorStep = lesson.steps[cursor];
                if (!isStepComplete(priorStep.id) && !canAdvanceWithoutCheck(priorStep)) {
                    return false;
                }
            }
        }

        state.currentStepIndex = index;
        persist();
        return true;
    }

    function goBack() {
        if (!canGoBack()) {
            return false;
        }

        state.currentStepIndex -= 1;
        persist();
        return true;
    }

    function goNext() {
        if (!canGoNext()) {
            return false;
        }

        const currentStep = getCurrentStep();
        if (canAdvanceWithoutCheck(currentStep)) {
            completeTextStep(currentStep.id);
        }

        state.currentStepIndex += 1;
        persist();
        return true;
    }

    return {
        lesson,
        state,
        getCurrentStep,
        getCurrentStepIndex: () => state.currentStepIndex,
        getStepIndex: (stepId) => stepLookup[stepId],
        isStepComplete,
        canAdvanceFromStep,
        canGoBack,
        canGoNext,
        goBack,
        goNext,
        goToStep,
        getSelectedAnswer,
        setSelectedAnswer,
        getCheckedAnswer,
        setCheckedAnswer,
        getWidgetState,
        setWidgetState,
        getWidgetCheck,
        setWidgetCheck,
        getFeedback,
        completeTextStep
    };
}
