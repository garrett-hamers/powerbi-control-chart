import powerbi from "powerbi-visuals-api";
import { ChartMode, ChartRow, CalculatedPoint } from "../src/types";

export function row(
    index: number,
    value: number,
    options: Partial<ChartRow> = {}
): ChartRow {
    return {
        index,
        time: options.time ?? `T${index + 1}`,
        timeSortKey: options.timeSortKey,
        value,
        rawValue: options.rawValue,
        seriesKey: options.seriesKey ?? "All",
        seriesLabel: options.seriesLabel ?? "All",
        baselineKey: options.baselineKey ?? "Baseline",
        baselineLabel: options.baselineLabel ?? "Baseline",
        denominator: options.denominator,
        subgroupSD: options.subgroupSD,
        pointKey: options.pointKey,
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
    baselineKey = "Baseline",
    options: Partial<ChartRow> = {}
): CalculatedPoint {
    const base = row(index, value, {
        ...options,
        baselineKey,
        baselineLabel: options.baselineLabel ?? baselineKey
    });
    return {
        ...base,
        pointKey: base.pointKey ?? `${base.seriesKey}\u001f${base.baselineKey}\u001f${base.index}`,
        rawValue: value,
        plotValue: value,
        centerline,
        sigma,
        lowerOne: centerline - sigma,
        upperOne: centerline + sigma,
        lowerTwo: centerline - 2 * sigma,
        upperTwo: centerline + 2 * sigma,
        lowerThree: centerline - 3 * sigma,
        upperThree: centerline + 3 * sigma,
        controlLower: centerline - 3 * sigma,
        controlUpper: centerline + 3 * sigma,
        specificationStatus: "notConfigured",
        alarms: []
    };
}

export function settings(mode: ChartMode) {
    return {
        mode,
        sigmaMultiplier: 3,
        twoSigmaMultiplier: 2,
        shiftLength: 8,
        trendLength: 6,
        joinRebaselineRules: false,
        enableOutside3Sigma: true,
        enableTwoOfThree: true,
        enableShift: true,
        enableTrend: true
    };
}

export function visualDataView(
    values: number[],
    mode: ChartMode = "individuals",
    denominator?: number[],
    subgroupSD?: number[]
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
    const subgroupSDSource = {
        displayName: "Subgroup standard deviation",
        queryName: "subgroupSD",
        roles: { SubgroupSD: true },
        format: "0.00"
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
                ? [
                    valueColumn,
                    { source: denominatorSource, values: denominator },
                    ...(subgroupSD ? [{ source: subgroupSDSource, values: subgroupSD }] : [])
                ]
                : [
                    valueColumn,
                    ...(subgroupSD ? [{ source: subgroupSDSource, values: subgroupSD }] : [])
                ]
        }
    };
}

export function makeHost() {
    const selected: powerbi.visuals.ISelectionId[] = [];
    let selectionCallback: ((ids: powerbi.visuals.ISelectionId[]) => void) | undefined;
    const selectionManager = {
        select: jest.fn((id: powerbi.visuals.ISelectionId, multiSelect = false) => {
            if (!multiSelect) {
                selected.length = 0;
            }
            selected.push(id);
            selectionCallback?.(selected);
            return Promise.resolve(selected);
        }),
        clear: jest.fn(() => {
            selected.length = 0;
            selectionCallback?.(selected);
            return Promise.resolve({});
        }),
        showContextMenu: jest.fn((
            _selectionId: powerbi.extensibility.ISelectionId,
            _position: powerbi.extensibility.IPoint
        ) => Promise.resolve({})),
        getSelectionIds: jest.fn(() => selected),
        hasSelection: jest.fn(() => selected.length > 0),
        registerOnSelectCallback: jest.fn((callback: (ids: powerbi.visuals.ISelectionId[]) => void) => {
            selectionCallback = callback;
        })
    };
    const events = {
        renderingStarted: jest.fn(),
        renderingFinished: jest.fn(),
        renderingFailed: jest.fn()
    };
    const tooltipService = {
        enabled: jest.fn(() => true),
        show: jest.fn(),
        move: jest.fn(),
        hide: jest.fn()
    };
    const host: any = {
        locale: "en-US",
        colorPalette: {
            isHighContrast: false,
            foreground: { value: "#18333a" },
            background: { value: "#f7fbfa" },
            foregroundSelected: { value: "#000000" }
        },
        eventService: events,
        tooltipService,
        fetchMoreData: jest.fn(() => false),
        hostCapabilities: { allowInteractions: true },
        createLocalizationManager: () => ({ getDisplayName: (key: string) => key }),
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder: () => {
            const categories: string[] = [];
            const builder: any = {
                withCategory: jest.fn((column: any, index: number) => {
                    categories.push(`${column.source?.queryName ?? column.source?.displayName ?? "category"}:${index}`);
                    return builder;
                }),
                createSelectionId: () => {
                    const key = categories.join("|");
                    return {
                        key,
                        getKey: () => key,
                        equals: (other: { getKey?: () => string }) => other.getKey?.() === key
                    };
                }
            };
            return builder;
        }
    };
    return { host, selectionManager, events, tooltipService };
}
