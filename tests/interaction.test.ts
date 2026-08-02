import { Visual } from "../src/visual";
import { makeHost, visualDataView } from "./test-helpers";

function constructVisual() {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocked = makeHost();
    const visual = new Visual({
        element,
        host: mocked.host,
        viewport: { width: 600, height: 400 }
    } as any);
    visual.update({
        dataViews: [visualDataView([1, 2, 3, 4, 5])],
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
});
