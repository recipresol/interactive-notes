import { createLessonEngine } from "./core/engine.js";
import { renderHomePage, renderLessonPage, renderNotFound } from "./core/renderer.js";

async function loadJson(path) {
    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }

    return response.json();
}

function getLessonId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("lesson");
}

async function renderApp() {
    const root = document.getElementById("app");
    const lessonId = getLessonId();

    if (!root) {
        return;
    }

    if (!lessonId) {
        const catalog = await loadJson("./js/data/lessonCatalog.json");
        renderHomePage(root, catalog);
        return;
    }

    try {
        const catalog = await loadJson("./js/data/lessonCatalog.json");
        const lessonExists = (catalog.lessons || []).some((lesson) => lesson.id === lessonId);

        if (!lessonExists) {
            renderNotFound(root, lessonId);
            return;
        }

        const lesson = await loadJson(`./js/lessons/${encodeURIComponent(lessonId)}.json`);
        const engine = createLessonEngine(lesson);
        renderLessonPage(root, engine);
    } catch (error) {
        renderNotFound(root, lessonId);
    }
}

renderApp();
