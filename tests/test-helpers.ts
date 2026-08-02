import powerbi from "powerbi-visuals-api";
import { ChartMode, ChartRow, CalculatedPoint } from "../src/types";

export function row(
    index: number,
    value: number,
    options: Partial<ChartRow> = {}
): ChartRow {
    return {
        index,
        time: `T${index + 1}`,
        value,
        seriesKey: options.seriesKey ?? "All",
        seriesLabel: options.seriesLabel ?? "All",
        baselineKey: options.baselineKey ?? "Baseline",
        baselineLabel: options.baselineLabel ?? "Baseline",
        denominator: options.denominator,
        identity: options.identity,
        highlighted: options.highlighted,
        tooltipData: options.tooltipData ?? [],
        formatString: options.formatString
    };
}

export function calculatedPoint(
    index: number,
    value: number,
    centerline = 0,
    sigma = 1,
    baselineKey = "Baseline"
): CalculatedPoint {
    return {
        ...row(index, value, { baselineKey, baselineLabel: baselineKey }),
        centerline,
        sigma,
        lowerOne: centerline - sigma,
        upperOne: centerline + sigma,
        lowerTwo: centerline - 2 * sigma,
        upperTwo: centerline + 2 * sigma,
        lowerThree: centerline - 3 * sigma,
        upperThree: centerline + 3 * sigma,
        specificationStatus: "notConfigured",
        alarms: []
    };
}

export function settings(mode: ChartMode) {
    return {
        mode,
        sigmaMultiplier: 3,
        shiftLength: 8,
        trendLength: 6,
        joinRebaselineRules: false
    };
}

export function visualDataView(
    values: number[],
    mode: ChartMode = "individuals",
    denominator?: number[]
): any {
    const valueSource = {
        displayName: "Value",
        queryName: "value",
        roles: { Value: true },
        format: "0.00"
    };
    const denominatorSource = {
        displayName: "Denominator",
        queryName: "denominator",
        roles: { Denominator: true },
        format: "0"
    };
    const valueColumn = {
        source: valueSource,
        values,
        highlights: values.map(() => undefined)
    };
    const categories = [{
        source: { displayName: "Time", roles: { Time: true } },
        values: values.map((_, index) => `T${index + 1}`),
        identity: values.map((_, index) => ({ key: `T${index + 1}` }))
    }];
    return {
        metadata: {
            objects: {
                chart: { mode }
            }
        },
        categorical: {
            categories,
            values: denominator
                ? [valueColumn, { source: denominatorSource, values: denominator }]
                : [valueColumn]
        }
    };
}

export function makeHost() {
    const selected: powerbi.visuals.ISelectionId[] = [];
    const selectionManager = {
        select: jest.fn((id: powerbi.visuals.ISelectionId) => {
            selected.push(id);
            return Promise.resolve(selected);
        }),
        clear: jest.fn(() => {
            selected.length = 0;
            return Promise.resolve({});
        }),
        showContextMenu: jest.fn(() => Promise.resolve({})),
        getSelectionIds: jest.fn(() => selected),
        hasSelection: jest.fn(() => selected.length > 0),
        registerOnSelectCallback: jest.fn()
    };
    const events = {
        renderingStarted: jest.fn(),
        renderingFinished: jest.fn(),
        renderingFailed: jest.fn()
    };
    const tooltipService = {
        show: jest.fn(),
        hide: jest.fn()
    };
    const host: any = {
        locale: "en-US",
        colorPalette: { isHighContrast: false },
        eventService: events,
        tooltipService,
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder: () => ({
            withCategory: jest.fn().mockReturnThis(),
            createSelectionId: () => ({ key: "selection" })
        })
    };
    return { host, selectionManager, events, tooltipService };
}
