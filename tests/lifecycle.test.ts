import { Visual } from "../src/visual";
import { makeHost, visualDataView } from "./test-helpers";

describe("visual lifecycle", () => {
    test("emits rendering lifecycle events and removes DOM on destroy", () => {
        const element = document.createElement("div");
        const mocked = makeHost();
        const visual = new Visual({
            element,
            host: mocked.host,
            viewport: { width: 400, height: 300 }
        } as any);
        visual.update({
            dataViews: [visualDataView([1, 2, 3])],
            viewport: { width: 400, height: 300 },
            type: 2
        } as any);
        expect(mocked.events.renderingStarted).toHaveBeenCalled();
        expect(mocked.events.renderingFinished).toHaveBeenCalled();
        expect(element.querySelector(".atlyn-control-chart")).not.toBeNull();
        visual.destroy();
        expect(element.querySelector(".atlyn-control-chart")).toBeNull();
        const calls = mocked.events.renderingStarted.mock.calls.length;
        visual.update({
            dataViews: [visualDataView([1])],
            viewport: { width: 400, height: 300 },
            type: 2
        } as any);
        expect(mocked.events.renderingStarted).toHaveBeenCalledTimes(calls);
    });

    test("reports rendering failures through the event service", () => {
        const element = document.createElement("div");
        const mocked = makeHost();
        const visual = new Visual({ element, host: mocked.host } as any);
        mocked.host.createSelectionIdBuilder = () => {
            throw new Error("test");
        };
        visual.update({
            dataViews: [{ categorical: { categories: [], values: [] } }],
            viewport: { width: 400, height: 300 },
            type: 2
        } as any);
        expect(mocked.events.renderingFinished).toHaveBeenCalled();
    });
});
