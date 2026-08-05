import { SCENES } from "./scenes.mjs";

/**
 * Loads the packaged Atlyn Control Chart bundle into a mock Power BI host and renders one
 * screenshot scene. The mock host mirrors the host contract already exercised by
 * `tests/test-helpers.ts`; the chart itself is produced entirely by the packaged visual.
 */

const VISUAL_GUID = "atlynControlChartA1B2C3D4E5F6G7H8I9J0";

function createSelectionManager() {
    const selectionIds = [];
    let onSelect;
    return {
        registerOnSelectCallback: (callback) => {
            onSelect = callback;
        },
        getSelectionIds: () => selectionIds,
        select: (id, multiSelect) => {
            if (!multiSelect) {
                selectionIds.length = 0;
            }
            selectionIds.push(id);
            onSelect?.([...selectionIds]);
            return Promise.resolve([...selectionIds]);
        },
        clear: () => {
            selectionIds.length = 0;
            onSelect?.([]);
            return Promise.resolve({});
        },
        showContextMenu: () => Promise.resolve({}),
        hasSelection: () => selectionIds.length > 0
    };
}

function createSelectionIdBuilder() {
    const parts = [];
    const builder = {
        withCategory: (column, index) => {
            parts.push(`${column?.source?.queryName ?? column?.source?.displayName ?? "category"}:${index}`);
            return builder;
        },
        withSeries: () => builder,
        withMeasure: () => builder,
        withTable: (_table, rowIndex) => {
            parts.push(`table-row:${rowIndex}`);
            return builder;
        },
        createSelectionId: () => {
            const key = parts.join("|");
            return {
                key,
                getKey: () => key,
                equals: (other) => other?.getKey?.() === key,
                includes: (other) => other?.getKey?.() === key,
                getSelector: () => ({ data: [{ identity: key }] }),
                getSelectorsByColumn: () => ({}),
                hasIdentity: () => true
            };
        }
    };
    return builder;
}

function createHost(options = {}) {
    const selectionManager = createSelectionManager();
    const highContrast = options.highContrast === true;
    return {
        locale: options.locale ?? "en-US",
        hostCapabilities: { allowInteractions: true },
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder,
        colorPalette: {
            isHighContrast: highContrast,
            // A real high-contrast host reports the user's theme colours here, which the
            // visual applies inline; the .high-contrast class rules are the fallback for a
            // host that reports the flag without a palette.
            foreground: highContrast ? { value: "#ffffff" } : { value: "#18333a" },
            background: highContrast ? { value: "#000000" } : { value: "#ffffff" },
            foregroundSelected: highContrast ? { value: "#1aebff" } : { value: "#0f766e" },
            getColor: () => ({ value: highContrast ? "#ffffff" : "#0369a1" })
        },
        tooltipService: {
            enabled: () => false,
            show: () => undefined,
            move: () => undefined,
            hide: () => undefined
        },
        eventService: {
            renderingStarted: () => undefined,
            renderingFinished: () => undefined,
            renderingFailed: () => undefined
        },
        fetchMoreData: () => false,
        persistProperties: () => undefined,
        applyJsonFilter: () => undefined,
        createLocalizationManager: () => ({ getDisplayName: (key) => key })
    };
}

function fail(message) {
    document.documentElement.dataset.harnessError = message;
    document.title = `HARNESS ERROR: ${message}`;
    throw new Error(message);
}

function render() {
    const params = new URLSearchParams(window.location.search);
    const sceneId = params.get("scene") ?? SCENES[0].id;
    const scene = SCENES.find((candidate) => candidate.id === sceneId);
    if (!scene) {
        fail(`Unknown scene "${sceneId}"`);
    }

    document.getElementById("heading").textContent = scene.heading;
    document.getElementById("caption").textContent = scene.caption;

    const plugin = window.powerbi?.visuals?.plugins?.[VISUAL_GUID] ?? window[VISUAL_GUID]?.default;
    if (!plugin || typeof plugin.create !== "function") {
        fail("Packaged visual plugin was not registered - rebuild with `npm run package`.");
    }

    // Host variants exist so the render probe can exercise the high-contrast and RTL code
    // paths the stylesheet targets, rather than toggling classes from outside the visual.
    const host = createHost({
        highContrast: params.get("hc") === "1",
        locale: params.get("locale") ?? "en-US"
    });

    const element = document.getElementById("visual");
    // The render probe sizes the stage directly so it can exercise the visual's compact
    // layout branch; resizing the browser viewport would not shrink a fixed-size harness.
    const forcedWidth = Number(params.get("w"));
    const forcedHeight = Number(params.get("h"));
    if (Number.isFinite(forcedWidth) && forcedWidth > 0) {
        const stage = element.parentElement;
        stage.style.width = `${forcedWidth}px`;
        stage.style.height = `${Number.isFinite(forcedHeight) && forcedHeight > 0 ? forcedHeight : forcedWidth}px`;
        stage.style.flex = "none";
    }
    const visual = plugin.create({ element, host });
    let lastViewport = { width: 0, height: 0 };

    const update = () => {
        const bounds = element.getBoundingClientRect();
        lastViewport = { width: Math.round(bounds.width), height: Math.round(bounds.height) };
        visual.update({
            dataViews: [scene.dataView()],
            viewport: lastViewport,
            type: 2,
            viewMode: 1,
            editMode: 0,
            isInFocus: false,
            operationKind: 0,
            jsonFilters: []
        });
    };

    update();

    if (!element.querySelector("svg.atlyn-chart circle.atlyn-point")) {
        fail(`Scene "${scene.id}" rendered no control chart points.`);
    }

    // The capture harness resizes the viewport after load, exactly like a real host does.
    window.addEventListener("resize", () => {
        const bounds = element.getBoundingClientRect();
        if (Math.round(bounds.width) !== lastViewport.width
            || Math.round(bounds.height) !== lastViewport.height) {
            update();
        }
    });

    document.documentElement.dataset.harnessScene = scene.id;
    document.documentElement.dataset.harnessReady = "true";
    document.title = `READY:${scene.id}`;
}

render();
