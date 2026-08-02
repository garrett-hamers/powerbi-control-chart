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
    LineStyle,
    VisualSettings
} from "./types";

type VisualHost = powerbi.extensibility.visual.IVisualHost;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;

const SVG_NS = "http://www.w3.org/2000/svg";
const SUPPORTED_MODES: ChartMode[] = ["individuals", "run", "mr", "xbar", "r", "s", "p", "np", "u", "c"];
const MAX_RENDER_POINTS = 2000;
const DEFAULT_SETTINGS: VisualSettings = {
    mode: "individuals",
    direction: "both",
    sigmaMultiplier: 3,
    twoSigmaMultiplier: 2,
    shiftLength: 8,
    trendLength: 6,
    joinRebaselineRules: false,
    enableOutside3Sigma: true,
    enableTwoOfThree: true,
    enableShift: true,
    enableTrend: true,
    showBands: true,
    showControlLimits: true,
    showCenterline: true,
    showAxes: true,
    showSpecificationLimits: true,
    showAlarmTable: true,
    showPoints: true,
    pointSize: 4.5,
    lineWidth: 1.75,
    fontSize: 12,
    axisTickCount: 5,
    controlLineStyle: "dashed",
    centerlineLineStyle: "solid",
    specificationLineStyle: "dashed",
    controlColor: "#075957",
    centerlineColor: "#0a7774",
    specificationColor: "#654e9b",
    pointColor: "#075957",
    alarmColor: "#b54432",
    axisColor: "#18333a",
    textColor: "#18333a",
    backgroundColor: "#f7fbfa"
};

interface ParsedData {
    rows: ChartRow[];
    receivedRows: number;
    droppedRows: number;
    error?: "noData" | "missingDenominator" | "allInvalid";
}

type RenderingError = "noData" | "missingDenominator" | "allInvalid" | "renderingFailed";

interface SelectionIdentityLike {
    equals?: (other: unknown) => boolean;
    includes?: (other: unknown, ignoreHighlight?: boolean) => boolean;
    getKey?: () => string;
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
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value === "object" && value !== null && "value" in value) {
        return (value as { value: T }).value;
    }
    return value as T;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function timeSortKey(value: unknown): number | string {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.getTime();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    const text = textValue(value);
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) && text !== "" ? parsed : text;
}

function lineStyle(value: unknown, fallback: LineStyle): LineStyle {
    return value === "solid" || value === "dashed" || value === "dotted"
        ? value
        : fallback;
}

function colorValue(value: unknown): string | undefined {
    const isSafeColor = (candidate: string): boolean =>
        /^#[0-9a-f]{3,4}(?:[0-9a-f]{2})?$/i.test(candidate) ||
        /^(?:rgb|rgba|hsl|hsla)\([0-9.%\s,+\/-]+\)$/i.test(candidate);
    const safe = (candidate: string): string | undefined => {
        const normalized = candidate.trim();
        return isSafeColor(normalized) ? normalized : undefined;
    };
    if (typeof value === "string" && value.trim() !== "") {
        return safe(value);
    }
    if (typeof value === "object" && value !== null) {
        const solid = (value as { solid?: { color?: unknown } }).solid;
        return typeof solid?.color === "string" ? safe(solid.color) : undefined;
    }
    return undefined;
}

function pointKeyFor(point: CalculatedPoint): string {
    return point.pointKey ?? `${point.seriesKey}\u001f${point.baselineKey}\u001f${point.index}`;
}

function enumValue(value: string, displayName: string): powerbi.IEnumMember {
    return { value, displayName };
}

function themeColor(value: string | undefined): powerbi.ThemeColorData {
    return { value: value ?? "#000000" };
}

function pointElement(target: EventTarget | null): SVGCircleElement | undefined {
    if (!(target instanceof Element) || target.tagName.toLowerCase() !== "circle") {
        return undefined;
    }
    return target as unknown as SVGCircleElement;
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
    private readonly emptySelectionId: powerbi.extensibility.ISelectionId;
    private readonly tooltipService: powerbi.extensibility.ITooltipService;
    private readonly events: powerbi.extensibility.IVisualEventService;
    private readonly localizationManager?: powerbi.extensibility.ILocalizationManager;
    private readonly pointElements = new Map<string, SVGCircleElement>();
    private readonly eventHandlers: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
    private readonly renderEventHandlers: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
    private settings: VisualSettings = { ...DEFAULT_SETTINGS };
    private locale = "en-US";
    private viewport = { width: 480, height: 300 };
    private result: ChartResult | undefined;
    private selectedKeys = new Set<string>();
    private longPressTimer: ReturnType<typeof setTimeout> | undefined;
    private touchTooltipTimer: ReturnType<typeof setTimeout> | undefined;
    private segmentFetchExhausted = false;
    private segmentRequestInFlight = false;
    private destroyed = false;

    public constructor(options: VisualConstructorOptions = {} as VisualConstructorOptions) {
        this.host = options.host;
        this.element = options.element;
        this.selectionManager = this.host.createSelectionManager();
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.tooltipService = this.host.tooltipService;
        this.events = this.host.eventService;
        const createLocalizationManager = (this.host as unknown as {
            createLocalizationManager?: () => powerbi.extensibility.ILocalizationManager;
        }).createLocalizationManager;
        this.localizationManager = createLocalizationManager?.();
        const document = this.element.ownerDocument;

        this.root = document.createElement("div");
        this.root.className = "atlyn-control-chart";
        this.root.tabIndex = 0;
        this.root.setAttribute("role", "group");
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
        this.listen(this.root, "pointerdown", (event) => this.onRootPointerDown(event));
        this.listen(this.root, "pointerup", () => this.onRootPointerUp());
        this.listen(this.root, "pointercancel", () => this.onRootPointerUp());
        this.listen(this.root, "pointerleave", () => this.onRootPointerUp());
        this.selectionManager.registerOnSelectCallback((ids) => this.onHostSelection(ids));

        this.setDirection();
        this.renderEmpty("noData");
    }

    public update(options: VisualUpdateOptions): void {
        if (this.destroyed) {
            return;
        }
        this.events.renderingStarted(options);
        try {
            this.locale = this.host.locale || "en-US";
            const segment = options.dataViews?.[0]?.metadata?.segment as
                | { done?: boolean }
                | undefined;
            if (options.operationKind === powerbi.VisualDataChangeOperationKind.Create) {
                this.segmentFetchExhausted = false;
                this.segmentRequestInFlight = false;
            }
            if (segment) {
                this.segmentRequestInFlight = false;
                if (segment.done === true) {
                    this.segmentFetchExhausted = true;
                }
            } else if (options.operationKind === powerbi.VisualDataChangeOperationKind.Create) {
                this.segmentFetchExhausted = true;
            }
            this.viewport = {
                width: Math.max(180, options.viewport?.width ?? 480),
                height: Math.max(140, options.viewport?.height ?? 300)
            };
            this.settings = this.readSettings(options.dataViews?.[0]);
            this.setDirection();
            this.requestMoreDataIfNeeded(options.dataViews?.[0]);
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
                        : undefined,
                    locale: this.locale
                });
                this.result.droppedRows = parsed.droppedRows;
                this.result.receivedRows = parsed.receivedRows;
                this.result.hasMoreData = Boolean(segment && segment.done !== true);
                this.result.dataStatus = this.result.hasMoreData ? "partial" : this.result.dataStatus;
                this.onHostSelection(this.selectionManager.getSelectionIds());
                this.renderChart(this.result);
            }
            this.events.renderingFinished(options);
        } catch (error) {
            this.result = undefined;
            this.renderEmpty("renderingFailed");
            this.events.renderingFailed(options, error instanceof Error ? error.message : String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const descriptor = (objectName: string, propertyName: string) => ({ objectName, propertyName });
        const slice = (
            uid: string,
            displayNameKey: string,
            displayNameFallback: string,
            objectName: string,
            propertyName: string,
            type: string,
            value: unknown,
            extra: Record<string, unknown> = {}
        ) => ({
            uid,
            displayName: this.localized(displayNameKey, displayNameFallback),
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
                                "Chart_Mode_DisplayName",
                                "Chart mode",
                                "chart",
                                "mode",
                                "Dropdown",
                                enumValue(this.settings.mode, modeLabel(this.settings.mode, this.locale)),
                                {
                                    items: enumItems([
                                        ["individuals", "Individuals"],
                                        ["run", "Run"],
                                        ["mr", "Moving range (MR)"],
                                        ["xbar", "Xbar"],
                                        ["r", "Range (R)"],
                                        ["s", "Standard deviation (S)"],
                                        ["p", "P"],
                                        ["np", "NP"],
                                        ["u", "U"],
                                        ["c", "C"]
                                    ])
                                }
                            ),
                            slice(
                                "atlyn_direction",
                                "Direction_DisplayName",
                                "Direction",
                                "chart",
                                "direction",
                                "Dropdown",
                                enumValue(this.settings.direction, directionLabel(this.settings.direction, this.locale)),
                                {
                                    items: enumItems([
                                        ["both", "Show both sides"],
                                        ["higherIsBetter", "Higher is better"],
                                        ["lowerIsBetter", "Lower is better"],
                                        ["neutral", "Neutral"]
                                    ])
                                }
                            ),
                            slice(
                                "atlyn_sigma",
                                "Sigma_Multiplier_DisplayName",
                                "Control sigma multiplier",
                                "chart",
                                "sigmaMultiplier",
                                "NumUpDown",
                                this.settings.sigmaMultiplier
                            ),
                            slice(
                                "atlyn_two_sigma",
                                "Two_Sigma_Multiplier_DisplayName",
                                "Two-of-three sigma multiplier",
                                "chart",
                                "twoSigmaMultiplier",
                                "NumUpDown",
                                this.settings.twoSigmaMultiplier
                            ),
                            slice(
                                "atlyn_join",
                                "Join_Rebaseline_DisplayName",
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
                    uid: "atlyn_limits_card",
                    displayName: "Limits",
                    groups: [{
                        uid: "atlyn_limits_group",
                        displayName: "Limits",
                        slices: [
                            slice(
                                "atlyn_show_control",
                                "Show_Control_Limits_DisplayName",
                                "Show control limits",
                                "limits",
                                "showControlLimits",
                                "ToggleSwitch",
                                this.settings.showControlLimits
                            ),
                            slice(
                                "atlyn_show_bands",
                                "Show_Bands_DisplayName",
                                "Show 1/2 sigma bands",
                                "limits",
                                "showBands",
                                "ToggleSwitch",
                                this.settings.showBands
                            ),
                            slice(
                                "atlyn_show_center",
                                "Show_Centerline_DisplayName",
                                "Show centerline",
                                "limits",
                                "showCenterline",
                                "ToggleSwitch",
                                this.settings.showCenterline
                            ),
                            slice(
                                "atlyn_control_style",
                                "Control_Line_Style_DisplayName",
                                "Control line style",
                                "limits",
                                "controlLineStyle",
                                "Dropdown",
                                enumValue(this.settings.controlLineStyle, this.settings.controlLineStyle),
                                { items: enumItems([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) }
                            ),
                            slice(
                                "atlyn_center_style",
                                "Centerline_Line_Style_DisplayName",
                                "Centerline line style",
                                "limits",
                                "centerlineLineStyle",
                                "Dropdown",
                                enumValue(this.settings.centerlineLineStyle, this.settings.centerlineLineStyle),
                                { items: enumItems([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) }
                            ),
                            slice(
                                "atlyn_spec_style",
                                "Specification_Line_Style_DisplayName",
                                "Specification line style",
                                "limits",
                                "specificationLineStyle",
                                "Dropdown",
                                enumValue(this.settings.specificationLineStyle, this.settings.specificationLineStyle),
                                { items: enumItems([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) }
                            ),
                            slice(
                                "atlyn_lsl",
                                "Lower_Specification_DisplayName",
                                "Lower specification limit",
                                "specificationLimits",
                                "lower",
                                "NumUpDown",
                                this.settings.specificationLower ?? 0
                            ),
                            slice(
                                "atlyn_usl",
                                "Upper_Specification_DisplayName",
                                "Upper specification limit",
                                "specificationLimits",
                                "upper",
                                "NumUpDown",
                                this.settings.specificationUpper ?? 0
                            ),
                            slice(
                                "atlyn_spec_show",
                                "Show_Specification_DisplayName",
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
                    uid: "atlyn_rules_card",
                    displayName: "Rules",
                    groups: [{
                        uid: "atlyn_rules_group",
                        displayName: "Rules",
                        slices: [
                            slice(
                                "atlyn_enable_outside",
                                "Enable_Outside_DisplayName",
                                "Enable outside control limit rule",
                                "rules",
                                "enableOutside3Sigma",
                                "ToggleSwitch",
                                this.settings.enableOutside3Sigma
                            ),
                            slice(
                                "atlyn_enable_two",
                                "Enable_TwoOfThree_DisplayName",
                                "Enable two-of-three rule",
                                "rules",
                                "enableTwoOfThree",
                                "ToggleSwitch",
                                this.settings.enableTwoOfThree
                            ),
                            slice(
                                "atlyn_enable_shift",
                                "Enable_Shift_DisplayName",
                                "Enable shift rule",
                                "rules",
                                "enableShift",
                                "ToggleSwitch",
                                this.settings.enableShift
                            ),
                            slice(
                                "atlyn_enable_trend",
                                "Enable_Trend_DisplayName",
                                "Enable trend rule",
                                "rules",
                                "enableTrend",
                                "ToggleSwitch",
                                this.settings.enableTrend
                            ),
                            slice(
                                "atlyn_shift",
                                "Shift_Length_DisplayName",
                                "Shift points",
                                "rules",
                                "shiftLength",
                                "NumUpDown",
                                this.settings.shiftLength
                            ),
                            slice(
                                "atlyn_trend",
                                "Trend_Length_DisplayName",
                                "Trend points",
                                "rules",
                                "trendLength",
                                "NumUpDown",
                                this.settings.trendLength
                            )
                        ]
                    }]
                },
                {
                    uid: "atlyn_appearance_card",
                    displayName: "Appearance",
                    groups: [
                        {
                            uid: "atlyn_colors_group",
                            displayName: "Colors",
                            slices: [
                                slice("atlyn_control_color", "Control_Color_DisplayName", "Control color", "colors", "control", "ColorPicker", themeColor(this.settings.controlColor)),
                                slice("atlyn_center_color", "Centerline_Color_DisplayName", "Centerline color", "colors", "centerline", "ColorPicker", themeColor(this.settings.centerlineColor)),
                                slice("atlyn_spec_color", "Specification_Color_DisplayName", "Specification color", "colors", "specification", "ColorPicker", themeColor(this.settings.specificationColor)),
                                slice("atlyn_point_color", "Point_Color_DisplayName", "Point color", "colors", "point", "ColorPicker", themeColor(this.settings.pointColor)),
                                slice("atlyn_alarm_color", "Alarm_Color_DisplayName", "Alarm color", "colors", "alarm", "ColorPicker", themeColor(this.settings.alarmColor)),
                                slice("atlyn_axis_color", "Axis_Color_DisplayName", "Axis color", "colors", "axis", "ColorPicker", themeColor(this.settings.axisColor)),
                                slice("atlyn_text_color", "Text_Color_DisplayName", "Text color", "colors", "text", "ColorPicker", themeColor(this.settings.textColor)),
                                slice("atlyn_background_color", "Background_Color_DisplayName", "Background color", "colors", "background", "ColorPicker", themeColor(this.settings.backgroundColor))
                            ]
                        },
                        {
                            uid: "atlyn_axes_group",
                            displayName: "Axes and text",
                            slices: [
                                slice("atlyn_show_axes", "Show_Axes_DisplayName", "Show axes", "axes", "show", "ToggleSwitch", this.settings.showAxes),
                                slice("atlyn_axis_ticks", "Axis_Ticks_DisplayName", "Axis tick count", "axes", "tickCount", "NumUpDown", this.settings.axisTickCount),
                                slice("atlyn_font_size", "Font_Size_DisplayName", "Font size", "typography", "fontSize", "NumUpDown", this.settings.fontSize)
                            ]
                        },
                        {
                            uid: "atlyn_points_group",
                            displayName: "Points and lines",
                            slices: [
                                slice("atlyn_show_points", "Show_Points_DisplayName", "Show points", "points", "show", "ToggleSwitch", this.settings.showPoints),
                                slice("atlyn_point_size", "Point_Size_DisplayName", "Point size", "points", "size", "NumUpDown", this.settings.pointSize),
                                slice("atlyn_line_width", "Line_Width_DisplayName", "Line width", "points", "lineWidth", "NumUpDown", this.settings.lineWidth)
                            ]
                        }
                    ]
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
                                "Alarm_Table_DisplayName",
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
        this.clearRenderEventHandlers();
        for (const handler of this.eventHandlers) {
            handler.target.removeEventListener(handler.type, handler.listener);
        }
        this.eventHandlers.length = 0;
        this.pointElements.clear();
        this.selectedKeys.clear();
        this.cancelLongPress();
        this.cancelTouchTooltip();
        this.result = undefined;
        this.tooltipService.hide({ immediately: true, isTouchEvent: false });
        if (this.root.parentElement === this.element) {
            this.element.removeChild(this.root);
        }
    }

    private listen(target: EventTarget, type: string, listener: EventListener): void {
        target.addEventListener(type, listener);
        this.eventHandlers.push({ target, type, listener });
    }

    private listenRendered(target: EventTarget, type: string, listener: EventListener): void {
        target.addEventListener(type, listener);
        this.renderEventHandlers.push({ target, type, listener });
    }

    private clearRenderEventHandlers(): void {
        for (const handler of this.renderEventHandlers) {
            handler.target.removeEventListener(handler.type, handler.listener);
        }
        this.renderEventHandlers.length = 0;
    }

    private setDirection(): void {
        this.root.dir = directionFromLocale(this.locale);
        const palette = this.host.colorPalette;
        const foreground = colorValue(palette.foreground?.value);
        const background = colorValue(palette.background?.value);
        const selected = colorValue(palette.foregroundSelected?.value);
        if (foreground) {
            this.root.style.setProperty("--atlyn-ink", foreground);
            this.root.style.setProperty("--atlyn-muted", foreground);
            this.root.style.setProperty("--atlyn-line", foreground);
            this.root.style.setProperty("--atlyn-axis", foreground);
        }
        if (background) {
            this.root.style.setProperty("--atlyn-surface", background);
            this.root.style.setProperty("--atlyn-panel", background);
        }
        if (selected) {
            this.root.style.setProperty("--atlyn-selected", selected);
        }
        if (!palette.isHighContrast) {
            const colors: Array<[string, string | undefined]> = [
                ["--atlyn-control", this.settings.controlColor],
                ["--atlyn-centerline", this.settings.centerlineColor],
                ["--atlyn-spec", this.settings.specificationColor],
                ["--atlyn-point", this.settings.pointColor],
                ["--atlyn-alarm", this.settings.alarmColor],
                ["--atlyn-axis", this.settings.axisColor],
                ["--atlyn-ink", this.settings.textColor],
                ["--atlyn-surface", this.settings.backgroundColor]
            ];
            for (const [property, value] of colors) {
                if (value) {
                    this.root.style.setProperty(property, value);
                }
            }
        }
        this.root.style.fontSize = `${this.settings.fontSize}px`;
        this.root.style.setProperty("--atlyn-point-size", `${this.settings.pointSize}px`);
        this.root.style.setProperty("--atlyn-line-width", `${this.settings.lineWidth}`);
        this.root.classList.toggle("high-contrast", palette.isHighContrast);
        const view = this.element.ownerDocument.defaultView;
        const reducedMotion = Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
        this.root.classList.toggle("reduced-motion", reducedMotion);
        const allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;
        this.root.classList.toggle("interactions-disabled", !allowInteractions);
        this.title.textContent = t("title", this.locale);
        this.root.setAttribute("aria-label", t("title", this.locale));
    }

    private localized(key: string, fallback: string): string {
        const value = this.localizationManager?.getDisplayName(key);
        return value && value !== key ? value : fallback;
    }

    private requestMoreDataIfNeeded(dataView: any): void {
        if (!dataView?.metadata?.segment || this.segmentRequestInFlight || this.segmentFetchExhausted) {
            return;
        }
        const fetchMoreData = (this.host as unknown as {
            fetchMoreData?: (aggregateSegments?: boolean) => boolean;
        }).fetchMoreData;
        if (!fetchMoreData) {
            this.segmentFetchExhausted = true;
            return;
        }
        const accepted = fetchMoreData.call(this.host, true);
        if (accepted) {
            this.segmentRequestInFlight = true;
        } else {
            this.segmentFetchExhausted = true;
        }
    }

    private readSettings(dataView: any): VisualSettings {
        const objects = dataView?.metadata?.objects ?? {};
        const modeValue = safeSetting(objects, "chart", "mode", DEFAULT_SETTINGS.mode);
        const directionValue = safeSetting(objects, "chart", "direction", DEFAULT_SETTINGS.direction);
        const sigmaValue = numeric(safeSetting(objects, "chart", "sigmaMultiplier", DEFAULT_SETTINGS.sigmaMultiplier));
        const twoSigmaValue = numeric(safeSetting(objects, "chart", "twoSigmaMultiplier", DEFAULT_SETTINGS.twoSigmaMultiplier));
        const shiftValue = numeric(safeSetting(
            objects,
            "rules",
            "shiftLength",
            safeSetting(objects, "chart", "shiftLength", DEFAULT_SETTINGS.shiftLength)
        ));
        const trendValue = numeric(safeSetting(
            objects,
            "rules",
            "trendLength",
            safeSetting(objects, "chart", "trendLength", DEFAULT_SETTINGS.trendLength)
        ));
        const lower = numeric(safeSetting(objects, "specificationLimits", "lower", undefined));
        const upper = numeric(safeSetting(objects, "specificationLimits", "upper", undefined));
        const color = (objectName: string, propertyName: string, fallback: string | undefined): string | undefined =>
            colorValue(safeSetting(objects, objectName, propertyName, fallback)) ?? fallback;
        const bool = (objectName: string, propertyName: string, fallback: boolean): boolean =>
            Boolean(safeSetting(objects, objectName, propertyName, fallback));
        const settings: VisualSettings = {
            ...DEFAULT_SETTINGS,
            mode: SUPPORTED_MODES.includes(String(modeValue) as ChartMode)
                ? String(modeValue) as ChartMode
                : DEFAULT_SETTINGS.mode,
            direction: ["both", "higherIsBetter", "lowerIsBetter", "neutral"].includes(String(directionValue))
                ? String(directionValue) as Direction
                : DEFAULT_SETTINGS.direction,
            sigmaMultiplier: clamp(sigmaValue ?? DEFAULT_SETTINGS.sigmaMultiplier, 0.5, 6),
            twoSigmaMultiplier: clamp(twoSigmaValue ?? DEFAULT_SETTINGS.twoSigmaMultiplier ?? 2, 0.5, 4),
            shiftLength: Math.round(clamp(shiftValue ?? DEFAULT_SETTINGS.shiftLength, 2, 20)),
            trendLength: Math.round(clamp(trendValue ?? DEFAULT_SETTINGS.trendLength, 3, 20)),
            joinRebaselineRules: Boolean(safeSetting(
                objects,
                "chart",
                "joinRebaselineRules",
                DEFAULT_SETTINGS.joinRebaselineRules
            )),
            enableOutside3Sigma: bool("rules", "enableOutside3Sigma", DEFAULT_SETTINGS.enableOutside3Sigma ?? true),
            enableTwoOfThree: bool("rules", "enableTwoOfThree", DEFAULT_SETTINGS.enableTwoOfThree ?? true),
            enableShift: bool("rules", "enableShift", DEFAULT_SETTINGS.enableShift ?? true),
            enableTrend: bool("rules", "enableTrend", DEFAULT_SETTINGS.enableTrend ?? true),
            showBands: bool(
                "limits",
                "showBands",
                bool("chart", "showBands", DEFAULT_SETTINGS.showBands)
            ),
            showControlLimits: bool("limits", "showControlLimits", DEFAULT_SETTINGS.showControlLimits),
            showCenterline: bool("limits", "showCenterline", DEFAULT_SETTINGS.showCenterline),
            showAxes: bool("axes", "show", DEFAULT_SETTINGS.showAxes),
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
            showPoints: bool("points", "show", DEFAULT_SETTINGS.showPoints),
            pointSize: clamp(
                numeric(safeSetting(objects, "points", "size", DEFAULT_SETTINGS.pointSize)) ?? DEFAULT_SETTINGS.pointSize,
                2,
                10
            ),
            lineWidth: clamp(
                numeric(safeSetting(objects, "points", "lineWidth", DEFAULT_SETTINGS.lineWidth)) ?? DEFAULT_SETTINGS.lineWidth,
                1,
                4
            ),
            fontSize: clamp(
                numeric(safeSetting(objects, "typography", "fontSize", DEFAULT_SETTINGS.fontSize)) ?? DEFAULT_SETTINGS.fontSize,
                9,
                24
            ),
            axisTickCount: Math.round(clamp(
                numeric(safeSetting(objects, "axes", "tickCount", DEFAULT_SETTINGS.axisTickCount)) ?? DEFAULT_SETTINGS.axisTickCount,
                2,
                10
            )),
            controlLineStyle: lineStyle(
                safeSetting(objects, "limits", "controlLineStyle", DEFAULT_SETTINGS.controlLineStyle),
                DEFAULT_SETTINGS.controlLineStyle
            ),
            centerlineLineStyle: lineStyle(
                safeSetting(objects, "limits", "centerlineLineStyle", DEFAULT_SETTINGS.centerlineLineStyle),
                DEFAULT_SETTINGS.centerlineLineStyle
            ),
            specificationLineStyle: lineStyle(
                safeSetting(objects, "limits", "specificationLineStyle", DEFAULT_SETTINGS.specificationLineStyle),
                DEFAULT_SETTINGS.specificationLineStyle
            ),
            controlColor: color("colors", "control", DEFAULT_SETTINGS.controlColor),
            centerlineColor: color("colors", "centerline", DEFAULT_SETTINGS.centerlineColor),
            specificationColor: color("colors", "specification", DEFAULT_SETTINGS.specificationColor),
            pointColor: color("colors", "point", DEFAULT_SETTINGS.pointColor),
            alarmColor: color("colors", "alarm", DEFAULT_SETTINGS.alarmColor),
            axisColor: color("colors", "axis", DEFAULT_SETTINGS.axisColor),
            textColor: color("colors", "text", DEFAULT_SETTINGS.textColor),
            backgroundColor: color("colors", "background", DEFAULT_SETTINGS.backgroundColor),
            specificationLower: lower,
            specificationUpper: upper
        };
        return settings;
    }

    private parseData(dataView: any): ParsedData {
        const categorical = dataView?.categorical;
        const categories: any[] = categorical?.categories ?? [];
        const values: any[] = categorical?.values ?? [];
        const timeColumn = categories.find((column) => roleMatches(column, "Time"));
        const valueColumn = values.find((column) => roleMatches(column, "Value"));
        if (!timeColumn || !valueColumn) {
            return { rows: [], receivedRows: 0, droppedRows: 0, error: "noData" };
        }

        const seriesColumn = categories.find((column) => roleMatches(column, "Series"));
        const baselineColumn = categories.find((column) => roleMatches(column, "BaselineGroup"));
        const denominatorColumn = values.find((column) => roleMatches(column, "Denominator"));
        const subgroupSDColumn = values.find((column) => roleMatches(column, "SubgroupSD"));
        if ((this.settings.mode === "p" || this.settings.mode === "u" || this.settings.mode === "np") && !denominatorColumn) {
            const receivedRows = Math.max(
                timeColumn.values?.length ?? 0,
                valueColumn.values?.length ?? 0
            );
            return { rows: [], receivedRows, droppedRows: receivedRows, error: "missingDenominator" };
        }
        const tooltipColumns = [
            ...categories.filter((column) =>
                roleMatches(column, "Tooltips") && column !== timeColumn && column !== seriesColumn &&
                column !== baselineColumn
            ),
            ...values.filter((column) =>
                roleMatches(column, "Tooltips") &&
                column !== valueColumn &&
                column !== denominatorColumn &&
                column !== subgroupSDColumn
            )
        ];
        const receivedRows = Math.max(
            timeColumn.values?.length ?? 0,
            valueColumn.values?.length ?? 0,
            denominatorColumn?.values?.length ?? 0,
            subgroupSDColumn?.values?.length ?? 0
        );
        const rows: ChartRow[] = [];
        let droppedRows = 0;
        const highlightColumns = [valueColumn, denominatorColumn, subgroupSDColumn].filter(Boolean);
        const hasAnyHighlight = highlightColumns.some((column) =>
            Array.isArray(column.highlights) &&
            column.highlights.some((value: unknown) => value !== null && value !== undefined)
        );

        for (let index = 0; index < receivedRows; index += 1) {
            const rawValue = numeric(valueColumn.values?.[index]);
            const rawDenominator = numeric(denominatorColumn?.values?.[index]);
            const rawSubgroupSD = numeric(subgroupSDColumn?.values?.[index]);
            const time = textValue(timeColumn.values?.[index]);
            if (time.trim() === "" || !validateRow(this.settings.mode, rawValue, rawDenominator, rawSubgroupSD)) {
                droppedRows += 1;
                continue;
            }
            const seriesLabel = textValue(seriesColumn?.values?.[index] ?? "All");
            const baselineLabel = textValue(baselineColumn?.values?.[index] ?? "Baseline");
            const highlighted = hasAnyHighlight
                ? highlightColumns.some((column) => {
                    const value = column.highlights?.[index];
                    return value !== null && value !== undefined;
                })
                : undefined;
            const builder = this.host.createSelectionIdBuilder().withCategory(timeColumn, index);
            if (seriesColumn) {
                builder.withCategory(seriesColumn, index);
            }
            if (baselineColumn) {
                builder.withCategory(baselineColumn, index);
            }
            const identity = builder.createSelectionId();
            const sortKey = timeSortKey(timeColumn.values?.[index]);
            const pointKey = `${seriesLabel}\u001f${baselineLabel}\u001f${index}`;
            const tooltipData = [
                ...tooltipColumns.map((column) => ({
                    displayName: textValue(column.source?.displayName ?? column.source?.queryName ?? "Tooltip"),
                    value: textValue(column.values?.[index])
                }))
            ];
            rows.push({
                index,
                time,
                timeSortKey: sortKey,
                value: rawValue as number,
                rawValue: rawValue as number,
                denominator: rawDenominator,
                subgroupSD: rawSubgroupSD,
                seriesKey: seriesLabel,
                seriesLabel,
                baselineKey: baselineLabel,
                baselineLabel,
                pointKey,
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

    private renderEmpty(error: RenderingError): void {
        this.clearRenderEventHandlers();
        this.clear(this.chartShell);
        this.clear(this.summary);
        this.clear(this.legend);
        this.clear(this.alarmPanel);
        this.title.textContent = t("title", this.locale);
        this.status.dataset.state = "error";
        const message = error === "noData"
            ? t("noData", this.locale)
            : error === "missingDenominator"
                ? t("missingDenominator", this.locale)
                : error === "renderingFailed"
                    ? t("renderingFailed", this.locale)
                    : t("allInvalid", this.locale);
        this.status.textContent = message;
        const state = this.element.ownerDocument.createElement("div");
        state.className = "atlyn-state";
        state.textContent = error === "noData"
            ? t("enterData", this.locale)
            : message;
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
        this.clearRenderEventHandlers();
        this.status.dataset.state = result.droppedRows > 0 ||
            result.dataStatus === "partial" ||
            result.dataStatus === "empty"
            ? "warning"
            : "ready";
        const renderedPoints = this.pointsForRendering(result);
        const statusParts = result.dataStatus === "empty"
            ? [t("insufficientData", this.locale), `${result.receivedRows} ${t("rows", this.locale)}`]
            : result.dataStatus === "partial"
            ? [t("incompleteData", this.locale), `${result.receivedRows} ${t("rows", this.locale)}`]
            : result.droppedRows > 0
                ? [`${t("partialData", this.locale)} ${result.droppedRows}/${result.receivedRows}`]
                : [`${result.receivedRows} ${t("rows", this.locale)}`];
        if (renderedPoints.length < result.points.length) {
            statusParts.push(`${renderedPoints.length} ${t("renderedPoints", this.locale)}`);
        }
        this.status.textContent = statusParts.join(" ");
        this.root.dataset.dataStatus = result.dataStatus;

        const latest = result.points[result.points.length - 1];
        this.addSummaryItem(t("latest", this.locale), latest ? this.formatNumber(latest.plotValue) : "—");
        this.addSummaryItem(t("centerline", this.locale), latest ? this.formatNumber(latest.centerline) : "—");
        this.addSummaryItem(t("limits", this.locale), latest && result.mode !== "run"
            ? `${this.formatNumber(latest.controlLower)} / ${this.formatNumber(latest.controlUpper)}`
            : t("notApplicable", this.locale));
        this.addSummaryItem(t("alarms", this.locale), String(this.visibleAlarms(result).length));
        this.addSummaryItem(t("direction", this.locale), directionLabel(this.settings.direction, this.locale));

        const svg = this.createSvg("svg");
        svg.classList.add("atlyn-chart");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", `${modeLabel(result.mode, this.locale)} chart`);
        this.chartShell.appendChild(svg);
        svg.dataset.renderedPoints = String(renderedPoints.length);
        svg.dataset.receivedPoints = String(result.points.length);
        this.drawSvg(svg, renderedPoints === result.points ? result : { ...result, points: renderedPoints });
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

    private interactionsAllowed(): boolean {
        return this.host.hostCapabilities?.allowInteractions !== false;
    }

    private pointsForRendering(result: ChartResult): CalculatedPoint[] {
        if (result.points.length <= MAX_RENDER_POINTS) {
            return result.points;
        }
        const keep = new Set<string>();
        const stride = Math.ceil(result.points.length / MAX_RENDER_POINTS);
        const priority = result.points.filter((point) =>
            point.alarms.length > 0 || this.selectedKeys.has(pointKeyFor(point))
        );
        const sampled = result.points.filter((point, index) =>
            index % stride === 0 || index === result.points.length - 1
        );
        const prioritized = priority.slice(0, Math.floor(MAX_RENDER_POINTS / 2));
        for (const point of prioritized) {
            keep.add(pointKeyFor(point));
        }
        for (const point of sampled) {
            if (keep.size >= MAX_RENDER_POINTS) {
                break;
            }
            keep.add(pointKeyFor(point));
        }
        return result.points.filter((point) => keep.has(pointKeyFor(point))).slice(0, MAX_RENDER_POINTS);
    }

    private pointSegments(points: CalculatedPoint[]): CalculatedPoint[][] {
        const segments: CalculatedPoint[][] = [];
        let current: CalculatedPoint[] = [];
        let baselineKey: string | undefined;
        for (const point of points) {
            if (current.length > 0 && point.baselineKey !== baselineKey) {
                segments.push(current);
                current = [];
            }
            current.push(point);
            baselineKey = point.baselineKey;
        }
        if (current.length > 0) {
            segments.push(current);
        }
        return segments;
    }

    private validSpecificationBounds(): boolean {
        return !(
            isFiniteNumber(this.settings.specificationLower) &&
            isFiniteNumber(this.settings.specificationUpper) &&
            this.settings.specificationLower > this.settings.specificationUpper
        );
    }

    private drawSvg(svg: SVGSVGElement, result: ChartResult): void {
        const compact = this.viewport.width < 420;
        const width = Math.max(260, this.viewport.width - 16);
        const height = Math.max(130, this.viewport.height - (compact ? 138 : 158));
        const margin = { left: compact ? 36 : 46, right: 14, top: 12, bottom: 27 };
        const plotWidth = Math.max(80, width - margin.left - margin.right);
        const plotHeight = Math.max(70, height - margin.top - margin.bottom);
        const rtl = this.root.dir === "rtl";
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "none");

        const values: number[] = [];
        for (const point of result.points) {
            values.push(point.plotValue);
            if (result.mode !== "run") {
                values.push(point.controlLower, point.controlUpper);
            }
            if (this.validSpecificationBounds()) {
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
            margin.left + (rtl ? plotWidth : 0) +
            (count <= 1
                ? plotWidth / 2
                : (rtl ? -1 : 1) * position * plotWidth / (count - 1));
        const y = (value: number): number =>
            margin.top + (maximum - value) * plotHeight / (maximum - minimum);

        if (this.settings.showAxes) {
            for (let tick = 0; tick < this.settings.axisTickCount; tick += 1) {
                const value = minimum + (maximum - minimum) * tick / Math.max(1, this.settings.axisTickCount - 1);
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
                label.setAttribute("x", String(rtl ? width - margin.right + 6 : margin.left - 6));
                label.setAttribute("y", String(yPosition + 3));
                label.setAttribute("text-anchor", rtl ? "start" : "end");
                label.textContent = this.formatNumber(value);
                svg.appendChild(label);
            }
            const axis = this.createSvg("line");
            axis.classList.add("atlyn-axis");
            axis.setAttribute("x1", String(rtl ? width - margin.right : margin.left));
            axis.setAttribute("x2", String(rtl ? width - margin.right : margin.left));
            axis.setAttribute("y1", String(margin.top));
            axis.setAttribute("y2", String(height - margin.bottom));
            svg.appendChild(axis);
        }

        for (const seriesKey of result.series) {
            const points = result.points.filter((point) => point.seriesKey === seriesKey);
            const seriesIndex = result.series.indexOf(seriesKey);
            const pointX = new Map<string, number>();
            points.forEach((point, index) => pointX.set(pointKeyFor(point), x(index, points.length)));
            for (const segment of this.pointSegments(points)) {
                if (segment.length > 1) {
                    const line = this.createSvg("path");
                    line.classList.add("atlyn-series-line", `series-${seriesIndex % 4}`);
                    line.setAttribute("d", this.pathFor(segment, pointX, y, (point) => point.plotValue));
                    line.setAttribute("data-series-key", seriesKey);
                    svg.appendChild(line);
                }
                if (result.mode !== "run" && this.settings.showBands) {
                    this.drawBand(svg, segment, pointX, y, "lowerOne", "upperOne", "band-one");
                    this.drawBand(svg, segment, pointX, y, "lowerTwo", "upperTwo", "band-two");
                }
                if (result.mode !== "run" && this.settings.showControlLimits) {
                    this.drawBand(svg, segment, pointX, y, "controlLower", "controlUpper", "band-three");
                }
                if (this.settings.showCenterline) {
                    const centerline = this.createSvg("path");
                    centerline.classList.add("atlyn-centerline", `line-${this.settings.centerlineLineStyle}`);
                    centerline.setAttribute("d", this.pathFor(segment, pointX, y, (point) => point.centerline));
                    svg.appendChild(centerline);
                }
            }
            for (const point of points) {
                const key = pointKeyFor(point);
                const hasVisibleAlarm = point.alarms.some((rule) =>
                    result.alarms.some((alarm) =>
                        alarm.pointKeys.includes(key) &&
                        alarm.rule === rule &&
                        alarmIsVisible(alarm, this.settings.direction)
                    )
                );
                if (!this.settings.showPoints && !hasVisibleAlarm) {
                    continue;
                }
                const circle = this.createSvg("circle");
                circle.classList.add("atlyn-point", `series-${seriesIndex % 4}`);
                if (hasVisibleAlarm) {
                    circle.classList.add("is-alarm");
                }
                if (this.selectedKeys.has(key)) {
                    circle.classList.add("is-selected");
                }
                if (result.hasHighlights && point.highlighted !== true) {
                    circle.classList.add("is-dimmed");
                }
                circle.setAttribute("data-point-key", key);
                circle.setAttribute("cx", String(pointX.get(key) ?? 0));
                circle.setAttribute("cy", String(y(point.plotValue)));
                circle.setAttribute("r", String(compact ? Math.min(this.settings.pointSize, 4) : this.settings.pointSize));
                circle.setAttribute("tabindex", this.pointElements.size === 0 ? "0" : "-1");
                circle.setAttribute("role", "button");
                circle.setAttribute("aria-selected", this.selectedKeys.has(key) ? "true" : "false");
                circle.setAttribute("aria-label", this.pointAriaLabel(point, result));
                this.listenRendered(circle, "click", (event) => {
                    event.stopPropagation();
                    this.selectPoint(point, this.isMultiSelect(event as MouseEvent));
                });
                this.listenRendered(circle, "contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.showContextMenu(point, event as MouseEvent);
                });
                this.listenRendered(circle, "mouseenter", (event) => this.showTooltip(point, event as MouseEvent));
                this.listenRendered(circle, "pointerenter", (event) => {
                    if ((event as PointerEvent).pointerType !== "touch") {
                        this.showTooltip(point, event as PointerEvent);
                    }
                });
                this.listenRendered(circle, "mousemove", (event) => this.moveTooltip(point, event as MouseEvent));
                this.listenRendered(circle, "pointermove", (event) => {
                    if ((event as PointerEvent).pointerType !== "touch") {
                        this.moveTooltip(point, event as PointerEvent);
                    }
                });
                this.listenRendered(circle, "focus", (event) => this.showTooltip(point, event as FocusEvent));
                this.listenRendered(circle, "mouseleave", () => this.hideTooltip(false));
                this.listenRendered(circle, "pointerleave", (event) => {
                    if ((event as PointerEvent).pointerType !== "touch") {
                        this.hideTooltip(false);
                    }
                });
                this.listenRendered(circle, "blur", () => this.hideTooltip(false));
                svg.appendChild(circle);
                this.pointElements.set(key, circle);
            }
        }

        if (this.settings.showSpecificationLimits && this.validSpecificationBounds()) {
            this.drawSpecificationLine(
                svg,
                this.settings.specificationLower,
                t("specificationLower", this.locale),
                margin,
                width,
                y
            );
            this.drawSpecificationLine(
                svg,
                this.settings.specificationUpper,
                t("specificationUpper", this.locale),
                margin,
                width,
                y
            );
        }
    }

    private drawBand(
        svg: SVGSVGElement,
        points: CalculatedPoint[],
        pointX: Map<string, number>,
        y: (value: number) => number,
        lowerKey: "lowerOne" | "lowerTwo" | "controlLower",
        upperKey: "upperOne" | "upperTwo" | "controlUpper",
        className: string
    ): void {
        if (points.length === 0) {
            return;
        }
        const lower = this.createSvg("path");
        lower.classList.add("atlyn-band", className, `line-${this.settings.controlLineStyle}`);
        lower.setAttribute("d", this.pathFor(points, pointX, y, (point) => point[lowerKey]));
        svg.appendChild(lower);
        const upper = this.createSvg("path");
        upper.classList.add("atlyn-band", className, `line-${this.settings.controlLineStyle}`);
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
        line.classList.add("atlyn-specification", `line-${this.settings.specificationLineStyle}`);
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
        pointX: Map<string, number>,
        y: (value: number) => number,
        valueFor: (point: CalculatedPoint) => number
    ): string {
        return points.map((point, index) => {
            const xPosition = pointX.get(pointKeyFor(point)) ?? 0;
            return `${index === 0 ? "M" : "L"}${xPosition.toFixed(2)},${y(valueFor(point)).toFixed(2)}`;
        }).join(" ");
    }
    private renderLegend(result: ChartResult): void {
        if (this.settings.showCenterline) {
            this.addLegendItem(t("centerline", this.locale), "center");
        }
        if (result.mode === "run") {
            this.addLegendItem(t("runSemantics", this.locale), "control");
        } else if (this.settings.showBands) {
            this.addLegendItem(t("oneSigma", this.locale), "control");
            this.addLegendItem(t("twoSigma", this.locale), "control");
        }
        if (result.mode !== "run" && this.settings.showControlLimits) {
            this.addLegendItem(`${t("control", this.locale)} (${this.settings.sigmaMultiplier} sigma)`, "control");
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
            cell.colSpan = 8;
            cell.textContent = t("noAlarms", this.locale);
            row.appendChild(cell);
            body.appendChild(row);
            table.appendChild(body);
            this.alarmPanel.appendChild(table);
            return;
        }
        const head = this.element.ownerDocument.createElement("thead");
        const headerRow = this.element.ownerDocument.createElement("tr");
        for (const label of [
            t("rule", this.locale),
            t("series", this.locale),
            t("point", this.locale),
            t("value", this.locale),
            t("side", this.locale),
            t("limit", this.locale),
            t("baseline", this.locale),
            t("explanation", this.locale)
        ]) {
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
            const point = result.points.find((candidate) => pointKeyFor(candidate) === alarm.pointKey);
            const cells = [
                alarmLabel(alarm, this.locale),
                alarm.seriesLabel,
                `${alarm.windowStart + 1}-${alarm.windowEnd + 1}`,
                point ? this.formatNumber(point.plotValue) : this.formatNumber(alarm.plotValue),
                alarm.side,
                this.formatNumber(alarm.limit),
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
                event.stopPropagation();
                this.showContextMenu(
                    result.points.find((point) => pointKeyFor(point) === alarm.pointKey),
                    event as MouseEvent
                );
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
            alarm.pointKeys.includes(pointKeyFor(point)) && alarmIsVisible(alarm, this.settings.direction)
        );
        const alarmText = alarms.length > 0
            ? ` ${alarms.map((alarm) => alarmLabel(alarm, this.locale)).join(", ")}.`
            : "";
        const denominator = point.denominator === undefined
            ? ""
            : `, ${t("denominator", this.locale)} ${this.formatNumber(point.denominator)}`;
        const raw = point.denominator === undefined
            ? ""
            : `, ${t("rawValue", this.locale)} ${this.formatNumber(point.rawValue)}`;
        return `${t("time", this.locale)} ${point.time}, ${t("plotValue", this.locale)} ${this.formatNumber(point.plotValue)}${raw}${denominator}, ${t("centerline", this.locale)} ${this.formatNumber(point.centerline)}.${alarmText}`;
    }

    private alarmAriaLabel(alarm: Alarm): string {
        return `${alarmLabel(alarm, this.locale)}, ${t("series", this.locale)} ${alarm.seriesLabel}, ${t("point", this.locale)} ${alarm.windowStart + 1}-${alarm.windowEnd + 1}, ${t("plotValue", this.locale)} ${this.formatNumber(alarm.plotValue)}, ${t("limit", this.locale)} ${this.formatNumber(alarm.limit)}. ${alarm.explanation}`;
    }

    private onRootClick(event: Event): void {
        if (!this.interactionsAllowed()) {
            return;
        }
        const target = event.target;
        if (!pointElement(target) &&
            !(target instanceof HTMLTableRowElement) &&
            !(target instanceof HTMLButtonElement)) {
            this.clearSelection();
        }
    }

    private onRootContextMenu(event: Event): void {
        if (!this.interactionsAllowed()) {
            return;
        }
        const mouseEvent = event as MouseEvent;
        if (pointElement(mouseEvent.target)) {
            return;
        }
        mouseEvent.preventDefault();
        this.showContextMenu(undefined, mouseEvent);
    }

    private onRootPointerDown(event: Event): void {
        if (!this.interactionsAllowed()) {
            return;
        }
        const pointerEvent = event as PointerEvent;
        if (pointerEvent.pointerType !== "touch") {
            return;
        }
        const target = pointerEvent.target;
        const pointKey = pointElement(target)?.dataset.pointKey;
        const point = pointKey
            ? this.result?.points.find((candidate) => pointKeyFor(candidate) === pointKey)
            : undefined;
        if (point) {
            this.cancelTouchTooltip();
            this.touchTooltipTimer = setTimeout(() => {
                this.showTooltip(point, pointerEvent);
                this.touchTooltipTimer = undefined;
            }, 300);
        }
        this.cancelLongPress();
        this.longPressTimer = setTimeout(() => {
            this.showContextMenu(point, pointerEvent);
            this.longPressTimer = undefined;
        }, 600);
    }

    private onRootPointerUp(): void {
        this.cancelLongPress();
        this.cancelTouchTooltip();
        this.hideTooltip(true);
    }

    private cancelTouchTooltip(): void {
        if (this.touchTooltipTimer !== undefined) {
            clearTimeout(this.touchTooltipTimer);
            this.touchTooltipTimer = undefined;
        }
    }

    private cancelLongPress(): void {
        if (this.longPressTimer !== undefined) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }
    }

    private onRootKeyDown(event: Event): void {
        if (!this.interactionsAllowed()) {
            return;
        }
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Escape") {
            keyboardEvent.preventDefault();
            this.clearSelection();
            return;
        }
        if (!this.result || this.result.points.length === 0) {
            return;
        }
        const focused = this.focusedKey();
        if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowDown") {
            keyboardEvent.preventDefault();
            this.focusPoint(this.nextPointKey(focused, 1));
        } else if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowUp") {
            keyboardEvent.preventDefault();
            this.focusPoint(this.nextPointKey(focused, -1));
        } else if (keyboardEvent.key === "Enter" && focused !== undefined) {
            keyboardEvent.preventDefault();
            const point = this.result.points.find((candidate) => pointKeyFor(candidate) === focused);
            if (point) {
                this.selectPoint(point, keyboardEvent.ctrlKey || keyboardEvent.metaKey);
            }
        }
    }

    private focusedKey(): string | undefined {
        for (const [key, element] of this.pointElements) {
            if (element === this.element.ownerDocument.activeElement) {
                return key;
            }
        }
        const first = this.result?.points[0];
        return first ? pointKeyFor(first) : undefined;
    }

    private nextPointKey(current: string | undefined, delta: number): string {
        const keys = [...this.pointElements.keys()];
        if (keys.length === 0) {
            return "";
        }
        const currentPosition = current === undefined ? 0 : Math.max(0, keys.indexOf(current));
        const next = (currentPosition + delta + keys.length) % keys.length;
        return keys[next];
    }

    private focusPoint(key: string): void {
        const target = this.pointElements.get(key);
        if (!target) {
            return;
        }
        for (const element of this.pointElements.values()) {
            element.setAttribute("tabindex", element === target ? "0" : "-1");
        }
        target.focus();
    }

    private selectAlarm(alarm: Alarm): void {
        const point = this.result?.points.find((candidate) => pointKeyFor(candidate) === alarm.pointKey);
        if (point) {
            this.selectPoint(point, false);
            this.pointElements.get(pointKeyFor(point))?.focus();
        }
    }

    private selectPoint(point: CalculatedPoint, multiSelect: boolean): void {
        if (!this.interactionsAllowed()) {
            return;
        }
        if (!multiSelect) {
            this.selectedKeys.clear();
        }
        const key = pointKeyFor(point);
        if (multiSelect && this.selectedKeys.has(key)) {
            this.selectedKeys.delete(key);
        } else {
            this.selectedKeys.add(key);
        }
        this.updateSelectionClasses();
        if (point.identity) {
            void this.selectionManager.select(point.identity, multiSelect);
        }
    }

    private clearSelection(): void {
        this.selectedKeys.clear();
        this.updateSelectionClasses();
        void this.selectionManager.clear();
    }

    private updateSelectionClasses(): void {
        for (const [key, element] of this.pointElements) {
            element.classList.toggle("is-selected", this.selectedKeys.has(key));
            element.setAttribute("aria-selected", this.selectedKeys.has(key) ? "true" : "false");
        }
    }

    private onHostSelection(ids: powerbi.extensibility.ISelectionId[]): void {
        if (this.destroyed) {
            return;
        }
        this.selectedKeys.clear();
        if (this.result && ids.length > 0) {
            for (const point of this.result.points) {
                const identity = point.identity;
                if (identity && ids.some((id) => this.selectionIdsMatch(id, identity))) {
                    this.selectedKeys.add(pointKeyFor(point));
                }
            }
        }
        this.updateSelectionClasses();
    }

    private selectionIdsMatch(
        left: powerbi.extensibility.ISelectionId,
        right: powerbi.visuals.ISelectionId
    ): boolean {
        if (left === right) {
            return true;
        }
        const leftLike = left as unknown as SelectionIdentityLike;
        const rightLike = right as unknown as SelectionIdentityLike;
        return Boolean(
            leftLike.equals?.(right) ||
            rightLike.equals?.(left) ||
            (leftLike.getKey && rightLike.getKey && leftLike.getKey() === rightLike.getKey())
        );
    }

    private isMultiSelect(event: MouseEvent): boolean {
        return event.ctrlKey || event.metaKey;
    }

    private showContextMenu(point: CalculatedPoint | undefined, event: MouseEvent): void {
        if (!this.interactionsAllowed()) {
            return;
        }
        const position = { x: event.clientX, y: event.clientY };
        const selectionId = point?.identity ?? this.emptySelectionId;
        void this.selectionManager.showContextMenu(selectionId, position);
    }

    private showTooltip(point: CalculatedPoint, event: MouseEvent | FocusEvent | PointerEvent): void {
        if (!this.interactionsAllowed() || !this.tooltipService.enabled()) {
            return;
        }
        const alarms = this.result?.alarms.filter((alarm) =>
            alarm.pointKeys.includes(pointKeyFor(point)) && alarmIsVisible(alarm, this.settings.direction)
        ) ?? [];
        const dataItems = [
            { displayName: t("time", this.locale), value: point.time },
            { displayName: t("value", this.locale), value: this.formatNumber(point.plotValue) },
            ...(point.denominator === undefined
                ? []
                : [
                    {
                        displayName: this.result?.mode === "p"
                            ? t("numerator", this.locale)
                            : t("count", this.locale),
                        value: this.formatNumber(point.rawValue)
                    },
                    { displayName: t("denominator", this.locale), value: this.formatNumber(point.denominator) }
                ]),
            ...(point.denominator === undefined
                ? []
                : [{ displayName: t("rawValue", this.locale), value: this.formatNumber(point.rawValue) }]),
            ...(point.subgroupSD === undefined
                ? []
                : [{ displayName: t("subgroupSD", this.locale), value: this.formatNumber(point.subgroupSD) }]),
            ...(point.seriesLabel === "All" ? [] : [{ displayName: t("series", this.locale), value: point.seriesLabel }]),
            ...(point.baselineLabel === "Baseline" ? [] : [{ displayName: t("baseline", this.locale), value: point.baselineLabel }]),
            ...point.tooltipData,
            { displayName: t("centerline", this.locale), value: this.formatNumber(point.centerline) },
            ...(this.result?.mode === "run"
                ? []
                : [
                    { displayName: t("lowerControl", this.locale), value: this.formatNumber(point.controlLower) },
                    { displayName: t("upperControl", this.locale), value: this.formatNumber(point.controlUpper) }
                ]),
            { displayName: t("sigma", this.locale), value: this.formatNumber(point.sigma) },
            { displayName: t("formula", this.locale), value: this.result?.formula ?? "" },
            { displayName: "Format string", value: point.formatString ?? "default" },
            ...(this.validSpecificationBounds() && isFiniteNumber(this.settings.specificationLower)
                ? [{ displayName: t("specificationLower", this.locale), value: this.formatNumber(this.settings.specificationLower) }]
                : []),
            ...(this.validSpecificationBounds() && isFiniteNumber(this.settings.specificationUpper)
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
        this.tooltipService.show({
            dataItems,
            identities: point.identity ? [point.identity] : [],
            coordinates: [clientX, clientY],
            isTouchEvent: "pointerType" in event && event.pointerType === "touch"
        });
    }

    private moveTooltip(point: CalculatedPoint, event: MouseEvent | PointerEvent): void {
        if (!this.interactionsAllowed() || !this.tooltipService.enabled()) {
            return;
        }
        const target = event.target instanceof Element ? event.target.getBoundingClientRect() : undefined;
        const clientX = "clientX" in event ? event.clientX : target?.left ?? 0;
        const clientY = "clientY" in event ? event.clientY : target?.top ?? 0;
        this.tooltipService.move({
            identities: point.identity ? [point.identity] : [],
            coordinates: [clientX, clientY],
            isTouchEvent: "pointerType" in event && event.pointerType === "touch"
        });
    }

    private hideTooltip(isTouchEvent: boolean): void {
        if (this.tooltipService.enabled()) {
            this.tooltipService.hide({ immediately: false, isTouchEvent });
        }
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
