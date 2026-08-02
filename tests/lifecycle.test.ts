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
        expect(mocked.events.renderingStarted).toHaveBeenCalledTimes(1);
        expect(mocked.events.renderingFinished).toHaveBeenCalledTimes(1);
        expect(mocked.events.renderingFailed).not.toHaveBeenCalled();
        expect(mocked.events.renderingStarted.mock.calls[0][0]).toEqual(expect.objectContaining({
            viewport: { width: 400, height: 300 }
        }));
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
            dataViews: [visualDataView([1, 2, 3])],
            viewport: { width: 400, height: 300 },
            type: 2
        } as any);
        expect(mocked.events.renderingStarted).toHaveBeenCalledTimes(1);
        expect(mocked.events.renderingFailed).toHaveBeenCalledTimes(1);
        expect(mocked.events.renderingFailed).toHaveBeenCalledWith(
            expect.anything(),
            "test"
        );
        expect(mocked.events.renderingFinished).not.toHaveBeenCalled();
    });

    test("treats a completed segment as complete and does not fetch again", () => {
        const element = document.createElement("div");
        const mocked = makeHost();
        const visual = new Visual({ element, host: mocked.host } as any);
        const dataView = visualDataView([1, 2, 3]);
        dataView.metadata.segment = { done: true };
        visual.update({
            dataViews: [dataView],
            viewport: { width: 400, height: 300 },
            type: 2
        } as any);
        expect(mocked.host.fetchMoreData).not.toHaveBeenCalled();
        expect(element.querySelector(".atlyn-control-chart")?.getAttribute("data-data-status")).toBe("complete");
        expect(mocked.events.renderingStarted).toHaveBeenCalledTimes(1);
        expect(mocked.events.renderingFinished).toHaveBeenCalledTimes(1);
        visual.destroy();
    });

    test("removes rendered point listeners before replacing the chart", () => {
        const element = document.createElement("div");
        const mocked = makeHost();
        const visual = new Visual({ element, host: mocked.host } as any);
        visual.update({
            dataViews: [visualDataView([1, 2, 3])],
            viewport: { width: 400, height: 300 },
            type: 2
        } as any);
        const oldPoint = element.querySelector(".atlyn-point") as SVGCircleElement;
        const removeListener = jest.spyOn(oldPoint, "removeEventListener");
        visual.update({
            dataViews: [visualDataView([2, 3, 4])],
            viewport: { width: 400, height: 300 },
            type: 2
        } as any);
        expect(removeListener).toHaveBeenCalled();
        visual.destroy();
    });
});
