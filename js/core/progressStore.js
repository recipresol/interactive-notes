function getStorageKey(lessonId) {
    return `module-progress:${lessonId}`;
}

export function loadProgress(lessonId) {
    const raw = window.localStorage.getItem(getStorageKey(lessonId));

    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        return parsed;
    } catch (error) {
        return null;
    }
}

export function saveProgress(lessonId, progress) {
    window.localStorage.setItem(getStorageKey(lessonId), JSON.stringify(progress));
}
