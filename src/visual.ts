import powerbi from "powerbi-visuals-api";
import { alarmIsVisible, ruleLabel } from "./rules";
import { alarmLabel, directionFromLocale, directionLabel, modeLabel, specificationLabel, t } from "./locale";
import { calculateChart, validateRow } from "./statistics";
import {
    Alarm,
    CalculatedPoint,
    ChartMode,
    ChartResult,
    ChartRow,
    Direction,
    VisualSettings
} from "./types";

type VisualHost = powerbi.extensibility.visual.IVisualHost;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_SETTINGS: VisualSettings = {
    mode: "individuals",
    direction: "both",
    sigmaMultiplier: 3,
    shiftLength: 8,
    trendLength: 6,
    joinRebaselineRules: false,
    showBands: true,
    showSpecificationLimits: true,
    showAlarmTable: true
};

interface ParsedData {
    rows: ChartRow[];
    receivedRows: number;
    droppedRows: number;
    error?: "noData" | "allInvalid";
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function numeric(value: unknown): number | undefined {
    if (isFiniteNumber(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function roleMatches(column: any, role: string): boolean {
    return Boolean(column?.source?.roles?.[role]);
}

function textValue(value: unknown): string {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value === null || value === undefined ? "" : String(value);
}

function safeSetting<T>(objects: any, objectName: string, propertyName: string, fallback: T): T {
    const value = objects?.[objectName]?.[propertyName];
    return value === undefined || value === null ? fallback : value as T;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

export class Visual implements powerbi.extensibility.visual.IVisual {
    private readonly host: VisualHost;
    private readonly element: HTMLElement;
    private readonly root: HTMLDivElement;
    private readonly header: HTMLDivElement;
    private readonly title: HTMLHeadingElement;
    private readonly status: HTMLDivElement;
    private readonly summary: HTMLDivElement;
    private readonly chartShell: HTMLDivElement;
    private readonly legend: HTMLDivElement;
    private readonly alarmPanel: HTMLDivElement;
    private readonly selectionManager: powerbi.extensibility.ISelectionManager;
    private readonly pointElements = new Map<number, SVGCircleElement>();
    private readonly eventHandlers: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
    private settings: VisualSettings = { ...DEFAULT_SETTINGS };
    private locale = "en-US";
    private viewport = { width: 480, height: 300 };
    private result: ChartResult | undefined;
    private selectedIndexes = new Set<number>();
    private destroyed = false;

    public constructor(options: VisualConstructorOptions = {} as VisualConstructorOptions) {
        this.host = options.host;
        this.element = options.element;
        this.selectionManager = this.host.createSelectionManager();
        const document = this.element.ownerDocument;

        this.root = document.createElement("div");
        this.root.className = "atlyn-control-chart";
        this.root.tabIndex = 0;
        this.root.setAttribute("role", "application");
        this.root.setAttribute("aria-label", "Atlyn Control Chart");

        this.header = document.createElement("div");
        this.header.className = "atlyn-header";
        this.title = document.createElement("h2");
        this.title.className = "atlyn-title";
        this.status = document.createElement("div");
        this.status.className = "atlyn-status";
        this.header.append(this.title, this.status);

        this.summary = document.createElement("div");
        this.summary.className = "atlyn-summary";
        this.summary.setAttribute("aria-live", "polite");

        this.chartShell = document.createElement("div");
        this.chartShell.className = "atlyn-chart-shell";

        this.legend = document.createElement("div");
        this.legend.className = "atlyn-legend";
        this.legend.setAttribute("aria-label", "Chart legend");

        this.alarmPanel = document.createElement("div");
        this.alarmPanel.className = "atlyn-alarm-panel";

        this.root.append(this.header, this.summary, this.chartShell, this.legend, this.alarmPanel);
        this.element.appendChild(this.root);

        this.listen(this.root, "click", (event) => this.onRootClick(event));
        this.listen(this.root, "contextmenu", (event) => this.onRootContextMenu(event));
        this.listen(this.root, "keydown", (event) => this.onRootKeyDown(event));

        this.setDirection();
        this.renderEmpty("noData");
    }

    public update(options: VisualUpdateOptions): void {
        if (this.destroyed) {
            return;
        }
        this.renderingStarted(options);
        try {
            this.locale = this.host.locale || "en-US";
            this.viewport = {
                width: Math.max(180, options.viewport?.width ?? 480),
                height: Math.max(140, options.viewport?.height ?? 300)
            };
            this.settings = this.readSettings(options.dataViews?.[0]);
            this.setDirection();
            const parsed = this.parseData(options.dataViews?.[0]);
            if (parsed.error) {
                this.result = undefined;
                this.renderEmpty(parsed.error);
            } else {
                this.result = calculateChart(parsed.rows, {
                    ...this.settings,
                    specificationLower: this.settings.showSpecificationLimits
                        ? this.settings.specificationLower
                        : undefined,
                    specificationUpper: this.settings.showSpecificationLimits
                        ? this.settings.specificationUpper
                        : undefined
                });
                this.result.droppedRows = parsed.droppedRows;
                this.result.receivedRows = parsed.receivedRows;
                this.renderChart(this.result);
            }
            this.renderingFinished(options);
        } catch (error) {
            this.result = undefined;
            this.renderEmpty("allInvalid");
            this.renderingFailed(options, error);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const descriptor = (objectName: string, propertyName: string) => ({ objectName, propertyName });
        const slice = (
            uid: string,
            displayName: string,
            objectName: string,
            propertyName: string,
            type: string,
            value: unknown,
            extra: Record<string, unknown> = {}
        ) => ({
            uid,
            displayName,
            control: {
                type,
                properties: {
                    descriptor: descriptor(objectName, propertyName),
                    value,
                    ...extra
                }
            }
        });
        const enumItems = (items: Array<[string, string]>) =>
            items.map(([value, displayName]) => ({ value, displayName }));
        return {
            cards: [
                {
                    uid: "atlyn_chart_card",
                    displayName: "Chart",
                    groups: [{
                        uid: "atlyn_chart_group",
                        displayName: "Chart",
                        slices: [
                            slice(
                                "atlyn_mode",
                                "Chart mode",
                                "chart",
                                "mode",
                                "Dropdown",
                                { value: this.settings.mode },
                                {
                                    items: enumItems([
                                        ["individuals", "Individuals"],
                                        ["run", "Run"],
                                        ["p", "P"],
                                        ["u", "U"],
                                        ["c", "C"]
                                    ])
                                }
                            ),
                            slice(
                                "atlyn_direction",
                                "Direction",
                                "chart",
                                "direction",
                                "Dropdown",
                                { value: this.settings.direction },
                                {
                                    items: enumItems([
                                        ["both", "Show both sides"],
                                        ["higherIsBetter", "Higher is better"],
                                        ["lowerIsBetter", "Lower is better"],
                                        ["neutral", "Neutral"]
                                    ])
                                }
                            ),
                            slice("atlyn_shift", "Shift points", "chart", "shiftLength", "NumUpDown", this.settings.shiftLength),
                            slice("atlyn_trend", "Trend points", "chart", "trendLength", "NumUpDown", this.settings.trendLength),
                            slice("atlyn_bands", "Show sigma bands", "chart", "showBands", "ToggleSwitch", this.settings.showBands),
                            slice(
                                "atlyn_join",
                                "Join rule sequences across baseline groups",
                                "chart",
                                "joinRebaselineRules",
                                "ToggleSwitch",
                                this.settings.joinRebaselineRules
                            )
                        ]
                    }]
                },
                {
                    uid: "atlyn_specification_card",
                    displayName: "Specification limits",
                    groups: [{
                        uid: "atlyn_specification_group",
                        displayName: "Specification limits",
                        slices: [
                            slice(
                                "atlyn_lsl",
                                "Lower specification limit",
                                "specificationLimits",
                                "lower",
                                "NumUpDown",
                                this.settings.specificationLower ?? 0
                            ),
                            slice(
                                "atlyn_usl",
                                "Upper specification limit",
                                "specificationLimits",
                                "upper",
                                "NumUpDown",
                                this.settings.specificationUpper ?? 0
                            ),
                            slice(
                                "atlyn_spec_show",
                                "Show specification limits",
                                "specificationLimits",
                                "show",
                                "ToggleSwitch",
                                this.settings.showSpecificationLimits
                            )
                        ]
                    }]
                },
                {
                    uid: "atlyn_accessibility_card",
                    displayName: "Accessibility",
                    groups: [{
                        uid: "atlyn_accessibility_group",
                        displayName: "Accessibility",
                        slices: [
                            slice(
                                "atlyn_alarm_table",
                                "Show accessible alarm table",
                                "accessibility",
                                "showAlarmTable",
                                "ToggleSwitch",
                                this.settings.showAlarmTable
                            )
                        ]
                    }]
                }
            ]
        } as powerbi.visuals.FormattingModel;
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        for (const handler of this.eventHandlers) {
            handler.target.removeEventListener(handler.type, handler.listener);
        }
        this.eventHandlers.length = 0;
        this.pointElements.clear();
        this.selectedIndexes.clear();
        this.result = undefined;
        if (this.root.parentElement === this.element) {
            this.element.removeChild(this.root);
        }
    }

    private listen(target: EventTarget, type: string, listener: EventListener): void {
        target.addEventListener(type, listener);
        this.eventHandlers.push({ target, type, listener });
    }

    private renderingStarted(options: VisualUpdateOptions): void {
        const service = (this.host as any).eventService;
        service?.renderingStarted?.(options);
    }

    private renderingFinished(options: VisualUpdateOptions): void {
        const service = (this.host as any).eventService;
        service?.renderingFinished?.(options);
    }

    private renderingFailed(options: VisualUpdateOptions, error: unknown): void {
        const service = (this.host as any).eventService;
        service?.renderingFailed?.(options, error instanceof Error ? error.message : "rendering failed");
    }

    private setDirection(): void {
        this.root.dir = directionFromLocale(this.locale);
        const palette = this.host.colorPalette as any;
        const paletteValue = (entry: any): string | undefined =>
            typeof entry === "string" ? entry : entry?.value;
        const foreground = paletteValue(palette?.foreground);
        const background = paletteValue(palette?.background);
        if (foreground) {
            this.root.style.setProperty("--atlyn-ink", foreground);
            this.root.style.setProperty("--atlyn-muted", foreground);
            this.root.style.setProperty("--atlyn-line", foreground);
        }
        if (background) {
            this.root.style.setProperty("--atlyn-surface", background);
            this.root.style.setProperty("--atlyn-panel", background);
        }
        this.root.classList.toggle("high-contrast", Boolean(palette?.isHighContrast));
        const view = this.element.ownerDocument.defaultView;
        const reducedMotion = Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
        this.root.classList.toggle("reduced-motion", reducedMotion);
        const allowInteractions = Boolean((this.host as any).hostCapabilities?.allowInteractions);
        this.root.classList.toggle("interactions-disabled", !allowInteractions);
        (this.host as any).createLocalizationManager?.();
        this.title.textContent = t("title", this.locale);
        this.root.setAttribute("aria-label", t("title", this.locale));
    }

    private readSettings(dataView: any): VisualSettings {
        const objects = dataView?.metadata?.objects ?? {};
        const modeValue = safeSetting(objects, "chart", "mode", DEFAULT_SETTINGS.mode);
        const directionValue = safeSetting(objects, "chart", "direction", DEFAULT_SETTINGS.direction);
        const shiftValue = numeric(safeSetting(objects, "chart", "shiftLength", DEFAULT_SETTINGS.shiftLength));
        const trendValue = numeric(safeSetting(objects, "chart", "trendLength", DEFAULT_SETTINGS.trendLength));
        const lower = numeric(safeSetting(objects, "specificationLimits", "lower", undefined));
        const upper = numeric(safeSetting(objects, "specificationLimits", "upper", undefined));
        const settings: VisualSettings = {
            ...DEFAULT_SETTINGS,
            mode: ["individuals", "run", "p", "u", "c"].includes(String(modeValue))
                ? String(modeValue) as ChartMode
                : DEFAULT_SETTINGS.mode,
            direction: ["both", "higherIsBetter", "lowerIsBetter", "neutral"].includes(String(directionValue))
                ? String(directionValue) as Direction
                : DEFAULT_SETTINGS.direction,
            sigmaMultiplier: DEFAULT_SETTINGS.sigmaMultiplier,
            shiftLength: Math.round(clamp(shiftValue ?? DEFAULT_SETTINGS.shiftLength, 2, 20)),
            trendLength: Math.round(clamp(trendValue ?? DEFAULT_SETTINGS.trendLength, 3, 20)),
            joinRebaselineRules: Boolean(safeSetting(
                objects,
                "chart",
                "joinRebaselineRules",
                DEFAULT_SETTINGS.joinRebaselineRules
            )),
            showBands: Boolean(safeSetting(objects, "chart", "showBands", DEFAULT_SETTINGS.showBands)),
            showSpecificationLimits: Boolean(safeSetting(
                objects,
                "specificationLimits",
                "show",
                DEFAULT_SETTINGS.showSpecificationLimits
            )),
            showAlarmTable: Boolean(safeSetting(
                objects,
                "accessibility",
                "showAlarmTable",
                DEFAULT_SETTINGS.showAlarmTable
            )),
            specificationLower: lower,
            specificationUpper: upper
        };
        return settings;
    }

    private parseData(dataView: any): ParsedData {
        const categorical = dataView?.categorical;
        const categories: any[] = categorical?.categories ?? [];
        const values: any[] = categorical?.values ?? [];
        const timeColumn = categories.find((column) => roleMatches(column, "Time")) ?? categories[0];
        const valueColumn = values.find((column) => roleMatches(column, "Value"));
        if (!timeColumn || !valueColumn) {
            return { rows: [], receivedRows: 0, droppedRows: 0, error: "noData" };
        }

        const seriesColumn = categories.find((column) => roleMatches(column, "Series"));
        const baselineColumn = categories.find((column) => roleMatches(column, "BaselineGroup"));
        const denominatorColumn = values.find((column) => roleMatches(column, "Denominator"));
        const tooltipColumns = [
            ...categories.filter((column) =>
                roleMatches(column, "Tooltips") && column !== timeColumn && column !== seriesColumn &&
                column !== baselineColumn
            ),
            ...values.filter((column) =>
                roleMatches(column, "Tooltips") && column !== valueColumn && column !== denominatorColumn
            )
        ];
        const receivedRows = Math.max(
            timeColumn.values?.length ?? 0,
            valueColumn.values?.length ?? 0
        );
        const rows: ChartRow[] = [];
        let droppedRows = 0;

        for (let index = 0; index < receivedRows; index += 1) {
            const rawValue = numeric(valueColumn.values?.[index]);
            const rawDenominator = numeric(denominatorColumn?.values?.[index]);
            if (!validateRow(this.settings.mode, rawValue, rawDenominator)) {
                droppedRows += 1;
                continue;
            }
            const seriesLabel = textValue(seriesColumn?.values?.[index] ?? "All");
            const baselineLabel = textValue(baselineColumn?.values?.[index] ?? "Baseline");
            const highlightedValues = [valueColumn, denominatorColumn]
                .filter(Boolean)
                .map((column) => column.highlights?.[index])
                .filter((value) => value !== undefined && value !== null);
            const highlighted = highlightedValues.length > 0
                ? highlightedValues.some((value) => value !== null && value !== undefined)
                : undefined;
            let identity: powerbi.visuals.ISelectionId | undefined;
            try {
                const builder = this.host.createSelectionIdBuilder().withCategory(timeColumn, index);
                if (seriesColumn) {
                    builder.withCategory(seriesColumn, index);
                }
                if (baselineColumn) {
                    builder.withCategory(baselineColumn, index);
                }
                identity = builder.createSelectionId();
            } catch {
                identity = undefined;
            }
            const tooltipData = [
                { displayName: t("time", this.locale), value: textValue(timeColumn.values?.[index]) },
                { displayName: t("value", this.locale), value: String(rawValue) },
                ...(rawDenominator === undefined
                    ? []
                    : [{ displayName: "Denominator", value: String(rawDenominator) }]),
                ...(seriesColumn
                    ? [{ displayName: "Series", value: seriesLabel }]
                    : []),
                ...(baselineColumn
                    ? [{ displayName: t("baseline", this.locale), value: baselineLabel }]
                    : []),
                ...tooltipColumns.map((column) => ({
                    displayName: textValue(column.source?.displayName ?? column.source?.queryName ?? "Tooltip"),
                    value: textValue(column.values?.[index])
                }))
            ];
            rows.push({
                index,
                time: textValue(timeColumn.values?.[index]),
                value: rawValue as number,
                denominator: rawDenominator,
                seriesKey: seriesLabel,
                seriesLabel,
                baselineKey: baselineLabel,
                baselineLabel,
                identity,
                highlighted,
                tooltipData,
                formatString: valueColumn.source?.format
            });
        }
        return {
            rows,
            receivedRows,
            droppedRows,
            error: rows.length === 0 ? "allInvalid" : undefined
        };
    }

    private renderEmpty(error: "noData" | "allInvalid"): void {
        this.clear(this.chartShell);
        this.clear(this.summary);
        this.clear(this.legend);
        this.clear(this.alarmPanel);
        this.title.textContent = t("title", this.locale);
        this.status.dataset.state = "error";
        this.status.textContent = error === "noData" ? t("noData", this.locale) : t("allInvalid", this.locale);
        const state = this.element.ownerDocument.createElement("div");
        state.className = "atlyn-state";
        state.textContent = error === "noData" ? t("enterData", this.locale) : t("allInvalid", this.locale);
        state.setAttribute("role", "status");
        this.chartShell.appendChild(state);
    }

    private renderChart(result: ChartResult): void {
        this.clear(this.chartShell);
        this.clear(this.summary);
        this.clear(this.legend);
        this.clear(this.alarmPanel);
        this.pointElements.clear();
        this.title.textContent = `${t("title", this.locale)} · ${modeLabel(result.mode, this.locale)}`;
        this.status.dataset.state = result.droppedRows > 0 ? "warning" : "ready";
        this.status.textContent = result.droppedRows > 0
            ? `${t("partialData", this.locale)} ${result.droppedRows}/${result.receivedRows}`
            : `${result.receivedRows} ${t("rows", this.locale)}`;

        const latest = result.points[result.points.length - 1];
        this.addSummaryItem(t("latest", this.locale), latest ? this.formatNumber(latest.value) : "—");
        this.addSummaryItem(t("centerline", this.locale), latest ? this.formatNumber(latest.centerline) : "—");
        this.addSummaryItem("LCL / UCL", latest
            ? `${this.formatNumber(latest.lowerThree)} / ${this.formatNumber(latest.upperThree)}`
            : "—");
        this.addSummaryItem(t("alarms", this.locale), String(this.visibleAlarms(result).length));
        this.addSummaryItem(t("direction", this.locale), directionLabel(this.settings.direction, this.locale));

        const svg = this.createSvg("svg");
        svg.classList.add("atlyn-chart");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", `${modeLabel(result.mode, this.locale)} chart`);
        this.chartShell.appendChild(svg);
        this.drawSvg(svg, result);
        this.renderLegend(result);
        this.renderAlarmTable(result);
    }

    private addSummaryItem(label: string, value: string): void {
        const item = this.element.ownerDocument.createElement("span");
        const labelElement = this.element.ownerDocument.createElement("span");
        labelElement.textContent = `${label}: `;
        const valueElement = this.element.ownerDocument.createElement("strong");
        valueElement.textContent = value;
        item.append(labelElement, valueElement);
        this.summary.appendChild(item);
    }

    private drawSvg(svg: SVGSVGElement, result: ChartResult): void {
        const compact = this.viewport.width < 420;
        const width = Math.max(260, this.viewport.width - 16);
        const height = Math.max(130, this.viewport.height - (compact ? 138 : 158));
        const margin = { left: compact ? 36 : 46, right: 14, top: 12, bottom: 27 };
        const plotWidth = Math.max(80, width - margin.left - margin.right);
        const plotHeight = Math.max(70, height - margin.top - margin.bottom);
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "none");

        const values: number[] = [];
        for (const point of result.points) {
            values.push(point.value, point.lowerThree, point.upperThree);
            if (this.settings.showSpecificationLimits) {
                if (isFiniteNumber(this.settings.specificationLower)) {
                    values.push(this.settings.specificationLower);
                }
                if (isFiniteNumber(this.settings.specificationUpper)) {
                    values.push(this.settings.specificationUpper);
                }
            }
        }
        let minimum = Math.min(...values);
        let maximum = Math.max(...values);
        if (!isFiniteNumber(minimum) || !isFiniteNumber(maximum)) {
            minimum = 0;
            maximum = 1;
        }
        if (minimum === maximum) {
            const padding = Math.max(1, Math.abs(minimum) * 0.1);
            minimum -= padding;
            maximum += padding;
        } else {
            const padding = (maximum - minimum) * 0.08;
            minimum -= padding;
            maximum += padding;
        }
        const x = (position: number, count: number): number =>
            margin.left + (count <= 1 ? plotWidth / 2 : position * plotWidth / (count - 1));
        const y = (value: number): number =>
            margin.top + (maximum - value) * plotHeight / (maximum - minimum);

        for (let tick = 0; tick <= 4; tick += 1) {
            const value = minimum + (maximum - minimum) * tick / 4;
            const yPosition = y(value);
            const grid = this.createSvg("line");
            grid.classList.add("atlyn-grid");
            grid.setAttribute("x1", String(margin.left));
            grid.setAttribute("x2", String(width - margin.right));
            grid.setAttribute("y1", String(yPosition));
            grid.setAttribute("y2", String(yPosition));
            svg.appendChild(grid);
            const label = this.createSvg("text");
            label.classList.add("atlyn-axis-label");
            label.setAttribute("x", String(margin.left - 6));
            label.setAttribute("y", String(yPosition + 3));
            label.setAttribute("text-anchor", "end");
            label.textContent = this.formatNumber(value);
            svg.appendChild(label);
        }
        const axis = this.createSvg("line");
        axis.classList.add("atlyn-axis");
        axis.setAttribute("x1", String(margin.left));
        axis.setAttribute("x2", String(margin.left));
        axis.setAttribute("y1", String(margin.top));
        axis.setAttribute("y2", String(height - margin.bottom));
        svg.appendChild(axis);

        for (const seriesKey of result.series) {
            const points = result.points.filter((point) => point.seriesKey === seriesKey);
            const seriesIndex = result.series.indexOf(seriesKey);
            const pointX = new Map<number, number>();
            points.forEach((point, index) => pointX.set(point.index, x(index, points.length)));
            if (points.length > 1) {
                const line = this.createSvg("path");
                line.classList.add("atlyn-series-line", `series-${seriesIndex % 4}`);
                line.setAttribute("d", this.pathFor(points, pointX, y, (point) => point.value));
                svg.appendChild(line);
            }
            if (this.settings.showBands) {
                this.drawBand(svg, points, pointX, y, "lowerOne", "upperOne", "band-one");
                this.drawBand(svg, points, pointX, y, "lowerTwo", "upperTwo", "band-two");
                this.drawBand(svg, points, pointX, y, "lowerThree", "upperThree", "band-three");
            }
            const centerline = this.createSvg("path");
            centerline.classList.add("atlyn-centerline");
            centerline.setAttribute("d", this.pathFor(points, pointX, y, (point) => point.centerline));
            svg.appendChild(centerline);
            for (const point of points) {
                const circle = this.createSvg("circle");
                circle.classList.add("atlyn-point", `series-${seriesIndex % 4}`);
                if (point.alarms.some((rule) =>
                    result.alarms.some((alarm) =>
                        alarm.pointIndices.includes(point.index) &&
                        alarm.rule === rule &&
                        alarmIsVisible(alarm, this.settings.direction)
                    )
                )) {
                    circle.classList.add("is-alarm");
                }
                if (this.settings.direction !== "both" && point.value !== point.centerline) {
                    const side = point.value > point.centerline ? "high" : "low";
                    if ((this.settings.direction === "higherIsBetter" && side === "high") ||
                        (this.settings.direction === "lowerIsBetter" && side === "low")) {
                        circle.classList.add("is-dimmed");
                    }
                }
                if (this.selectedIndexes.has(point.index)) {
                    circle.classList.add("is-selected");
                }
                if (result.hasHighlights && point.highlighted !== true) {
                    circle.classList.add("is-dimmed");
                }
                circle.setAttribute("cx", String(pointX.get(point.index) ?? 0));
                circle.setAttribute("cy", String(y(point.value)));
                circle.setAttribute("r", compact ? "4" : "4.5");
                circle.setAttribute("tabindex", "0");
                circle.setAttribute("role", "img");
                circle.setAttribute("aria-label", this.pointAriaLabel(point, result));
                this.listen(circle, "click", (event) => {
                    event.stopPropagation();
                    this.selectPoint(point, this.isMultiSelect(event as MouseEvent));
                });
                this.listen(circle, "contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.showContextMenu(point, event as MouseEvent);
                });
                this.listen(circle, "mouseenter", (event) => this.showTooltip(point, event as MouseEvent));
                this.listen(circle, "focus", (event) => this.showTooltip(point, event as FocusEvent));
                this.listen(circle, "mouseleave", () => this.hideTooltip());
                this.listen(circle, "blur", () => this.hideTooltip());
                svg.appendChild(circle);
                this.pointElements.set(point.index, circle);
            }
        }

        if (this.settings.showSpecificationLimits) {
            this.drawSpecificationLine(svg, this.settings.specificationLower, "LSL", margin, width, y);
            this.drawSpecificationLine(svg, this.settings.specificationUpper, "USL", margin, width, y);
        }
    }

    private drawBand(
        svg: SVGSVGElement,
        points: CalculatedPoint[],
        pointX: Map<number, number>,
        y: (value: number) => number,
        lowerKey: "lowerOne" | "lowerTwo" | "lowerThree",
        upperKey: "upperOne" | "upperTwo" | "upperThree",
        className: string
    ): void {
        if (points.length === 0) {
            return;
        }
        const lower = this.createSvg("path");
        lower.classList.add("atlyn-band", className);
        lower.setAttribute("d", this.pathFor(points, pointX, y, (point) => point[lowerKey]));
        svg.appendChild(lower);
        const upper = this.createSvg("path");
        upper.classList.add("atlyn-band", className);
        upper.setAttribute("d", this.pathFor(points, pointX, y, (point) => point[upperKey]));
        svg.appendChild(upper);
    }

    private drawSpecificationLine(
        svg: SVGSVGElement,
        value: number | undefined,
        labelText: string,
        margin: { left: number; right: number; top: number; bottom: number },
        width: number,
        y: (value: number) => number
    ): void {
        if (!isFiniteNumber(value)) {
            return;
        }
        const line = this.createSvg("line");
        line.classList.add("atlyn-specification");
        line.setAttribute("x1", String(margin.left));
        line.setAttribute("x2", String(width - margin.right));
        line.setAttribute("y1", String(y(value)));
        line.setAttribute("y2", String(y(value)));
        line.setAttribute("aria-label", `${labelText}: ${this.formatNumber(value)}`);
        svg.appendChild(line);
        const label = this.createSvg("text");
        label.classList.add("atlyn-axis-label");
        label.setAttribute("x", String(width - margin.right));
        label.setAttribute("y", String(y(value) - 3));
        label.setAttribute("text-anchor", "end");
        label.textContent = labelText;
        svg.appendChild(label);
    }

    private pathFor(
        points: CalculatedPoint[],
        pointX: Map<number, number>,
        y: (value: number) => number,
        valueFor: (point: CalculatedPoint) => number
    ): string {
        return points.map((point, index) => {
            const xPosition = pointX.get(point.index) ?? 0;
            return `${index === 0 ? "M" : "L"}${xPosition.toFixed(2)},${y(valueFor(point)).toFixed(2)}`;
        }).join(" ");
    }

    private renderLegend(result: ChartResult): void {
        this.addLegendItem(t("centerline", this.locale), "center");
        if (this.settings.showBands) {
            this.addLegendItem(t("oneSigma", this.locale), "control");
            this.addLegendItem(t("twoSigma", this.locale), "control");
            this.addLegendItem(t("threeSigma", this.locale), "control");
        }
        if (this.settings.showSpecificationLimits &&
            (isFiniteNumber(this.settings.specificationLower) || isFiniteNumber(this.settings.specificationUpper))) {
            this.addLegendItem(`${t("specificationLower", this.locale)} / ${t("specificationUpper", this.locale)}`, "spec");
        }
        for (const series of result.series) {
            this.addLegendItem(series, "series");
        }
        const formula = this.element.ownerDocument.createElement("span");
        formula.className = "atlyn-formula";
        formula.textContent = `${t("formula", this.locale)}: ${result.formula}`;
        formula.setAttribute("title", result.formula);
        this.legend.appendChild(formula);
    }

    private addLegendItem(labelText: string, kind: "center" | "control" | "spec" | "series"): void {
        const item = this.element.ownerDocument.createElement("span");
        item.className = "atlyn-legend-item";
        const swatch = this.element.ownerDocument.createElement("span");
        swatch.className = `atlyn-swatch ${kind}`;
        swatch.setAttribute("aria-hidden", "true");
        const label = this.element.ownerDocument.createElement("span");
        label.textContent = labelText;
        item.append(swatch, label);
        this.legend.appendChild(item);
    }

    private renderAlarmTable(result: ChartResult): void {
        if (!this.settings.showAlarmTable) {
            return;
        }
        const table = this.element.ownerDocument.createElement("table");
        table.className = "atlyn-alarm-table";
        table.setAttribute("aria-label", t("alarmTable", this.locale));
        const caption = this.element.ownerDocument.createElement("caption");
        caption.textContent = t("alarmTable", this.locale);
        table.appendChild(caption);
        const visibleAlarms = this.visibleAlarms(result);
        if (visibleAlarms.length === 0) {
            const body = this.element.ownerDocument.createElement("tbody");
            const row = this.element.ownerDocument.createElement("tr");
            const cell = this.element.ownerDocument.createElement("td");
            cell.colSpan = 5;
            cell.textContent = t("noAlarms", this.locale);
            row.appendChild(cell);
            body.appendChild(row);
            table.appendChild(body);
            this.alarmPanel.appendChild(table);
            return;
        }
        const head = this.element.ownerDocument.createElement("thead");
        const headerRow = this.element.ownerDocument.createElement("tr");
        for (const label of [t("rule", this.locale), t("point", this.locale), t("value", this.locale), t("baseline", this.locale), t("explanation", this.locale)]) {
            const header = this.element.ownerDocument.createElement("th");
            header.scope = "col";
            header.textContent = label;
            headerRow.appendChild(header);
        }
        head.appendChild(headerRow);
        table.appendChild(head);
        const body = this.element.ownerDocument.createElement("tbody");
        for (const alarm of visibleAlarms) {
            const row = this.element.ownerDocument.createElement("tr");
            row.className = "atlyn-alarm-row";
            row.tabIndex = 0;
            row.setAttribute("role", "button");
            row.setAttribute("aria-label", this.alarmAriaLabel(alarm));
            const point = result.points.find((candidate) => candidate.index === alarm.pointIndex);
            const cells = [
                alarmLabel(alarm, this.locale),
                `${alarm.windowStart + 1}–${alarm.windowEnd + 1}`,
                point ? this.formatNumber(point.value) : this.formatNumber(alarm.value),
                alarm.baselineLabel,
                alarm.explanation
            ];
            for (const value of cells) {
                const cell = this.element.ownerDocument.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            }
            this.listen(row, "click", (event) => {
                event.stopPropagation();
                this.selectAlarm(alarm);
            });
            this.listen(row, "keydown", (event) => {
                const keyboardEvent = event as KeyboardEvent;
                if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                    keyboardEvent.preventDefault();
                    this.selectAlarm(alarm);
                }
            });
            this.listen(row, "contextmenu", (event) => {
                event.preventDefault();
                this.showContextMenu(result.points.find((point) => point.index === alarm.pointIndex), event as MouseEvent);
            });
            body.appendChild(row);
        }
        table.appendChild(body);
        this.alarmPanel.appendChild(table);
    }

    private visibleAlarms(result: ChartResult): Alarm[] {
        return result.alarms.filter((alarm) => alarmIsVisible(alarm, this.settings.direction));
    }

    private pointAriaLabel(point: CalculatedPoint, result: ChartResult): string {
        const alarms = result.alarms.filter((alarm) =>
            alarm.pointIndices.includes(point.index) && alarmIsVisible(alarm, this.settings.direction)
        );
        const alarmText = alarms.length > 0
            ? ` ${alarms.map((alarm) => alarmLabel(alarm, this.locale)).join(", ")}.`
            : "";
        return `${t("time", this.locale)} ${point.time}, ${t("value", this.locale)} ${this.formatNumber(point.value)}, ${t("centerline", this.locale)} ${this.formatNumber(point.centerline)}.${alarmText}`;
    }

    private alarmAriaLabel(alarm: Alarm): string {
        return `${alarmLabel(alarm, this.locale)}, ${t("point", this.locale)} ${alarm.windowStart + 1}–${alarm.windowEnd + 1}. ${alarm.explanation}`;
    }

    private onRootClick(event: Event): void {
        const target = event.target;
        if (!(target instanceof SVGCircleElement) &&
            !(target instanceof HTMLTableRowElement) &&
            !(target instanceof HTMLButtonElement)) {
            this.clearSelection();
        }
    }

    private onRootContextMenu(event: Event): void {
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.target instanceof SVGCircleElement) {
            return;
        }
        mouseEvent.preventDefault();
        this.showContextMenu(undefined, mouseEvent);
    }

    private onRootKeyDown(event: Event): void {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Escape") {
            keyboardEvent.preventDefault();
            this.clearSelection();
            return;
        }
        if (!this.result || this.result.points.length === 0) {
            return;
        }
        const focused = this.focusedIndex();
        if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowDown") {
            keyboardEvent.preventDefault();
            this.focusPoint(this.nextPointIndex(focused, 1));
        } else if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowUp") {
            keyboardEvent.preventDefault();
            this.focusPoint(this.nextPointIndex(focused, -1));
        } else if (keyboardEvent.key === "Enter" && focused !== undefined) {
            keyboardEvent.preventDefault();
            const point = this.result.points.find((candidate) => candidate.index === focused);
            if (point) {
                this.selectPoint(point, keyboardEvent.ctrlKey || keyboardEvent.metaKey);
            }
        }
    }

    private focusedIndex(): number | undefined {
        for (const [index, element] of this.pointElements) {
            if (element === this.element.ownerDocument.activeElement) {
                return index;
            }
        }
        return this.result?.points[0]?.index;
    }

    private nextPointIndex(current: number | undefined, delta: number): number {
        const indexes = this.result?.points.map((point) => point.index) ?? [];
        if (indexes.length === 0) {
            return 0;
        }
        const currentPosition = current === undefined ? 0 : Math.max(0, indexes.indexOf(current));
        const next = (currentPosition + delta + indexes.length) % indexes.length;
        return indexes[next];
    }

    private focusPoint(index: number): void {
        this.pointElements.get(index)?.focus();
    }

    private selectAlarm(alarm: Alarm): void {
        const point = this.result?.points.find((candidate) => candidate.index === alarm.pointIndex);
        if (point) {
            this.selectPoint(point, false);
            this.pointElements.get(point.index)?.focus();
        }
    }

    private selectPoint(point: CalculatedPoint, multiSelect: boolean): void {
        if (!multiSelect) {
            this.selectedIndexes.clear();
        }
        if (multiSelect && this.selectedIndexes.has(point.index)) {
            this.selectedIndexes.delete(point.index);
        } else {
            this.selectedIndexes.add(point.index);
        }
        this.updateSelectionClasses();
        if (point.identity) {
            void this.selectionManager.select(point.identity, multiSelect);
        }
    }

    private clearSelection(): void {
        this.selectedIndexes.clear();
        this.updateSelectionClasses();
        void this.selectionManager.clear();
    }

    private updateSelectionClasses(): void {
        for (const [index, element] of this.pointElements) {
            element.classList.toggle("is-selected", this.selectedIndexes.has(index));
        }
    }

    private isMultiSelect(event: MouseEvent): boolean {
        return event.ctrlKey || event.metaKey;
    }

    private showContextMenu(point: CalculatedPoint | undefined, event: MouseEvent): void {
        const position = { x: event.clientX, y: event.clientY };
        const selectionId = point?.identity;
        if (selectionId) {
            this.selectionManager.showContextMenu(selectionId, position);
        } else {
            this.selectionManager.showContextMenu(undefined as any, position);
        }
    }

    private showTooltip(point: CalculatedPoint, event: MouseEvent | FocusEvent): void {
        const service = (this.host as any).tooltipService;
        if (!service?.show) {
            return;
        }
        const alarms = this.result?.alarms.filter((alarm) =>
            alarm.pointIndices.includes(point.index) && alarmIsVisible(alarm, this.settings.direction)
        ) ?? [];
        const dataItems = [
            ...point.tooltipData,
            { displayName: t("centerline", this.locale), value: this.formatNumber(point.centerline) },
            { displayName: "LCL (3 sigma)", value: this.formatNumber(point.lowerThree) },
            { displayName: "UCL (3 sigma)", value: this.formatNumber(point.upperThree) },
            { displayName: t("formula", this.locale), value: this.result?.formula ?? "" },
            { displayName: "Format string", value: point.formatString ?? "default" },
            ...(isFiniteNumber(this.settings.specificationLower)
                ? [{ displayName: t("specificationLower", this.locale), value: this.formatNumber(this.settings.specificationLower) }]
                : []),
            ...(isFiniteNumber(this.settings.specificationUpper)
                ? [{ displayName: t("specificationUpper", this.locale), value: this.formatNumber(this.settings.specificationUpper) }]
                : []),
            ...(point.specificationStatus === "notConfigured"
                ? []
                : [{ displayName: "Specification status", value: specificationLabel(point.specificationStatus, this.locale) }]),
            ...(alarms.length > 0
                ? [{ displayName: t("rule", this.locale), value: alarms.map((alarm) => `${ruleLabel(alarm.rule)}: ${alarm.explanation}`).join(" | ") }]
                : [])
        ];
        const target = event.target instanceof Element ? event.target.getBoundingClientRect() : undefined;
        const clientX = "clientX" in event ? event.clientX : target?.left ?? 0;
        const clientY = "clientY" in event ? event.clientY : target?.top ?? 0;
        service.show({
            dataItems,
            identities: point.identity ? [point.identity] : [],
            coordinates: [clientX, clientY],
            isTouchEvent: "pointerType" in event && event.pointerType === "touch"
        });
    }

    private hideTooltip(): void {
        const service = (this.host as any).tooltipService;
        service?.hide?.({ immediately: false, isTouchEvent: false });
    }

    private formatNumber(value: number | undefined): string {
        if (!isFiniteNumber(value)) {
            return "—";
        }
        try {
            return new Intl.NumberFormat(this.locale, { maximumFractionDigits: 4 }).format(value);
        } catch {
            return String(value);
        }
    }

    private createSvg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
        return this.element.ownerDocument.createElementNS(SVG_NS, tag);
    }

    private clear(element: Element): void {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }
}
