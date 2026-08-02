import { Visual } from "../src/visual";
import { makeHost, visualDataView } from "./test-helpers";

function constructVisual(
    mode: "individuals" | "run" | "p" | "u" | "c" = "individuals",
    values = [1, 2, 3, 4, 5],
    denominator?: number[]
) {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocked = makeHost();
    const visual = new Visual({
        element,
        host: mocked.host,
        viewport: { width: 600, height: 400 }
    } as any);
    visual.update({
        dataViews: [visualDataView(values, mode, denominator)],
        viewport: { width: 600, height: 400 },
        type: 2
    } as any);
    return { element, visual, ...mocked };
}

describe("visual interactions", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    test("renders SVG points and an accessible alarm table", () => {
        const { element } = constructVisual();
        expect(element.querySelectorAll("svg circle")).toHaveLength(5);
        expect(element.querySelector("table[aria-label]")).not.toBeNull();
        expect(element.querySelector("h2")?.textContent).toContain("Atlyn Control Chart");
    });

    test("includes series identity in alarm table cells and labels", () => {
        const element = document.createElement("div");
        document.body.appendChild(element);
        const mocked = makeHost();
        const dataView = visualDataView([0, 0, 0, 0, 10]);
        dataView.categorical.categories.push({
            source: { displayName: "Series", roles: { Series: true } },
            values: ["Line A", "Line A", "Line A", "Line A", "Line A"]
        });
        const visual = new Visual({ element, host: mocked.host } as any);
        visual.update({
            dataViews: [dataView],
            viewport: { width: 600, height: 400 },
            type: 2
        } as any);
        const headers = Array.from(element.querySelectorAll("thead th")).map((header) => header.textContent);
        const alarmRow = element.querySelector(".atlyn-alarm-row");
        expect(headers).toContain("Series");
        expect(alarmRow?.textContent).toContain("Line A");
        expect(alarmRow?.getAttribute("aria-label")).toContain("Series Line A");
        visual.destroy();
    });

    test("click and ctrl-click select points", () => {
        const { element, selectionManager } = constructVisual();
        const points = element.querySelectorAll("svg circle");
        (points[0] as SVGCircleElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        (points[1] as SVGCircleElement).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
        expect(selectionManager.select).toHaveBeenCalledTimes(2);
        expect(points[0].classList.contains("is-selected")).toBe(true);
        expect(points[1].classList.contains("is-selected")).toBe(true);
    });

    test("empty canvas and Escape clear selection", () => {
        const { element, selectionManager } = constructVisual();
        const point = element.querySelector("svg circle") as SVGCircleElement;
        point.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        element.querySelector(".atlyn-control-chart")?.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true
        }));
        expect(selectionManager.clear).toHaveBeenCalled();
        expect(point.classList.contains("is-selected")).toBe(false);
    });

    test("context menus and tooltips use host services", () => {
        const { element, selectionManager, tooltipService } = constructVisual();
        const point = element.querySelector("svg circle") as SVGCircleElement;
        point.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 12, clientY: 14 }));
        point.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, clientX: 12, clientY: 14 }));
        expect(selectionManager.showContextMenu).toHaveBeenCalled();
        expect(tooltipService.show).toHaveBeenCalled();
        point.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        expect(tooltipService.hide).toHaveBeenCalled();
    });

    test("empty-space context menus use a typed empty selection", () => {
        const { element, selectionManager } = constructVisual();
        const root = element.querySelector(".atlyn-control-chart") as HTMLDivElement;
        root.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 25 }));
        const calls = selectionManager.showContextMenu.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall?.[0]).toBeDefined();
    });

    test("keyboard arrows move point focus and Enter selects", () => {
        const { element, selectionManager } = constructVisual();
        const root = element.querySelector(".atlyn-control-chart") as HTMLDivElement;
        root.focus();
        root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement?.tagName).toBe("circle");
        root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(selectionManager.select).toHaveBeenCalled();
    });

    test("host selection callbacks synchronize composite point highlights", () => {
        const { element, selectionManager } = constructVisual();
        const points = element.querySelectorAll("svg circle");
        const first = points[0] as SVGCircleElement;
        first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(first.classList.contains("is-selected")).toBe(true);
        const selectedId = selectionManager.getSelectionIds()[0];
        selectionManager.clear();
        expect(first.classList.contains("is-selected")).toBe(false);
        selectionManager.select(selectedId ?? ({} as any));
        expect(first.classList.contains("is-selected")).toBe(true);
    });

    test("P tooltips expose normalized value, raw numerator, denominator, and control limits", () => {
        const { element, tooltipService } = constructVisual("p", [1, 4], [10, 20]);
        const point = element.querySelector("svg circle") as SVGCircleElement;
        point.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, clientX: 12, clientY: 14 }));
        const dataItems = tooltipService.show.mock.calls[0][0].dataItems as Array<{ displayName: string; value: string }>;
        expect(dataItems).toEqual(expect.arrayContaining([
            { displayName: "Value", value: "0.1" },
            { displayName: "Numerator", value: "1" },
            { displayName: "Denominator", value: "10" },
            expect.objectContaining({ displayName: "Lower control limit" }),
            expect.objectContaining({ displayName: "Upper control limit" })
        ]));
        point.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 20, clientY: 24 }));
        expect(tooltipService.move).toHaveBeenCalled();
    });

    test("touch long press opens a context menu and segment status stays explicit", () => {
        jest.useFakeTimers();
        const { element, selectionManager } = constructVisual();
        const point = element.querySelector("svg circle") as SVGCircleElement;
        const pointerDown = new Event("pointerdown", { bubbles: true });
        Object.defineProperty(pointerDown, "pointerType", { value: "touch" });
        point.dispatchEvent(pointerDown);
        jest.advanceTimersByTime(600);
        expect(selectionManager.showContextMenu).toHaveBeenCalled();
        jest.useRealTimers();

        const segmentVisual = constructVisual();
        const dataView = visualDataView([1, 2, 3]);
        dataView.metadata.segment = { done: false };
        segmentVisual.visual.update({
            dataViews: [dataView],
            viewport: { width: 600, height: 400 },
            type: 2
        } as any);
        expect(segmentVisual.host.fetchMoreData).toHaveBeenCalledWith(true);
        expect(segmentVisual.element.querySelector(".atlyn-control-chart")?.getAttribute("data-data-status"))
            .toBe("partial");
    });

    test("formatting model exposes limits, rules, colors, axes, typography, points, and multipliers", () => {
        const { visual } = constructVisual();
        const model = visual.getFormattingModel() as { cards: Array<{ groups: Array<{ slices: Array<{ control: { properties: { descriptor: { objectName: string; propertyName: string } } } }> }> }> };
        const descriptors = model.cards.flatMap((card) =>
            card.groups.flatMap((group) => group.slices.map((slice) => slice.control.properties.descriptor))
        );
        expect(descriptors).toEqual(expect.arrayContaining([
            { objectName: "chart", propertyName: "sigmaMultiplier" },
            { objectName: "rules", propertyName: "enableTrend" },
            { objectName: "colors", propertyName: "alarm" },
            { objectName: "axes", propertyName: "tickCount" },
            { objectName: "typography", propertyName: "fontSize" },
            { objectName: "points", propertyName: "size" }
        ]));
        const modeSlice = model.cards
            .flatMap((card) => card.groups.flatMap((group) => group.slices))
            .find((slice: any) => slice.control.properties.descriptor.propertyName === "mode") as any;
        expect(modeSlice.control.properties.items.map((item: any) => item.value)).toEqual(
            expect.arrayContaining(["mr", "xbar", "r", "s", "p", "np", "u", "c"])
        );
    });

    test("uses typed formatting values and ignores unsafe configured colors", () => {
        const { visual, element } = constructVisual();
        const model = visual.getFormattingModel() as any;
        const slices = model.cards.flatMap((card: any) =>
            card.groups.flatMap((group: any) => group.slices)
        );
        const modeSlice = slices.find((slice: any) =>
            slice.control.properties.descriptor.propertyName === "mode"
        );
        const colorSlice = slices.find((slice: any) =>
            slice.control.properties.descriptor.propertyName === "control"
        );
        expect(modeSlice.control.properties.value).toEqual(expect.objectContaining({ value: "individuals" }));
        expect(modeSlice.control.properties.items[0]).toEqual(expect.objectContaining({ value: "individuals" }));
        expect(colorSlice.control.properties.value).toEqual({ value: "#075957" });

        const dataView = visualDataView([1, 2, 3]);
        dataView.metadata.objects = {
            colors: { control: "url(https://example.invalid/unsafe)" }
        };
        visual.update({
            dataViews: [dataView],
            viewport: { width: 600, height: 400 },
            type: 2
        } as any);
        const root = element.querySelector(".atlyn-control-chart") as HTMLElement;
        expect(root.getAttribute("style")).not.toContain("url(");
        expect(root.style.getPropertyValue("--atlyn-control")).toBe("#075957");
        visual.destroy();
    });

    test("preserves highlighted series and adapts RTL, high contrast, and reduced motion", () => {
        const element = document.createElement("div");
        document.body.appendChild(element);
        const mocked = makeHost();
        mocked.host.locale = "ar-SA";
        mocked.host.colorPalette.isHighContrast = true;
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({ matches: true })
        });
        const dataView = visualDataView([1, 2, 3]);
        dataView.categorical.values[0].highlights = [1, null, null];
        const visual = new Visual({ element, host: mocked.host } as any);
        visual.update({
            dataViews: [dataView],
            viewport: { width: 260, height: 180 },
            type: 2
        } as any);
        const root = element.querySelector(".atlyn-control-chart") as HTMLDivElement;
        expect(root.dir).toBe("rtl");
        expect(root.classList.contains("high-contrast")).toBe(true);
        expect(root.classList.contains("reduced-motion")).toBe(true);
        expect(element.querySelectorAll("circle.is-dimmed")).toHaveLength(2);
        expect(element.querySelector(".atlyn-formula")?.textContent).toContain("CL");
        visual.destroy();
    });

    test("uses a roving focus target and exposes normalized/raw units", () => {
        const { element } = constructVisual("p", [1, 4], [10, 20]);
        const points = Array.from(element.querySelectorAll("svg circle")) as SVGCircleElement[];
        expect(points.map((point) => point.getAttribute("tabindex"))).toEqual(["0", "-1"]);
        expect(points[0].getAttribute("aria-label")).toContain("Plot value");
        expect(points[0].getAttribute("aria-label")).toContain("Raw value");
        points[0].focus();
        points[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(points[1]);
        expect(points[0].getAttribute("tabindex")).toBe("-1");
        expect(points[1].getAttribute("tabindex")).toBe("0");
    });

    test("gates all interactions when the host disables interactions", () => {
        const element = document.createElement("div");
        document.body.appendChild(element);
        const mocked = makeHost();
        mocked.host.hostCapabilities.allowInteractions = false;
        const visual = new Visual({ element, host: mocked.host } as any);
        visual.update({
            dataViews: [visualDataView([1, 2, 3])],
            viewport: { width: 600, height: 400 },
            type: 2
        } as any);
        const point = element.querySelector("svg circle") as SVGCircleElement;
        point.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        point.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 1, clientY: 1 }));
        expect(mocked.selectionManager.select).not.toHaveBeenCalled();
        expect(mocked.selectionManager.showContextMenu).not.toHaveBeenCalled();
        visual.destroy();
    });

    test("bounds SVG work for large data without changing completeness", () => {
        const values = Array.from({ length: 2200 }, (_, index) => index % 10);
        const { element } = constructVisual("individuals", values);
        const chart = element.querySelector("svg") as SVGSVGElement;
        expect(Number(chart.dataset.receivedPoints)).toBe(2200);
        expect(Number(chart.dataset.renderedPoints)).toBeLessThanOrEqual(2000);
        expect(element.querySelector(".atlyn-control-chart")?.getAttribute("data-data-status")).toBe("complete");
    });
});
