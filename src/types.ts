import powerbi from "powerbi-visuals-api";

export type ChartMode =
    | "individuals"
    | "run"
    | "mr"
    | "xbar"
    | "r"
    | "s"
    | "p"
    | "np"
    | "u"
    | "c";
export type Direction = "both" | "higherIsBetter" | "lowerIsBetter" | "neutral";
export type AlarmSide = "high" | "low" | "both";
export type RuleName = "outside3Sigma" | "twoOfThree" | "shift" | "trend";
export type SpecificationStatus = "within" | "below" | "above" | "notConfigured";
export type LineStyle = "solid" | "dashed" | "dotted";
export type DataStatus = "complete" | "partial" | "empty";

export interface ChartRow {
    index: number;
    time: string;
    timeSortKey?: number | string;
    value: number;
    rawValue?: number;
    denominator?: number;
    subgroupSD?: number;
    seriesKey: string;
    seriesLabel: string;
    baselineKey: string;
    baselineLabel: string;
    pointKey?: string;
    identity?: powerbi.visuals.ISelectionId;
    highlighted?: boolean;
    tooltipData: Array<{ displayName: string; value: string; color?: string }>;
    formatString?: string;
}

export interface PointStatistics {
    centerline: number;
    sigma: number;
    lowerOne: number;
    upperOne: number;
    lowerTwo: number;
    upperTwo: number;
    lowerThree: number;
    upperThree: number;
    controlLower: number;
    controlUpper: number;
    ruleLower?: number;
    ruleUpper?: number;
}

export interface CalculatedPoint extends Omit<ChartRow, "value">, PointStatistics {
    value: number;
    plotValue: number;
    rawValue: number;
    specificationStatus: SpecificationStatus;
    alarms: RuleName[];
}

export interface Alarm {
    id: string;
    rule: RuleName;
    seriesKey: string;
    seriesLabel: string;
    pointKey: string;
    pointKeys: string[];
    pointIndex: number;
    pointIndices: number[];
    windowStart: number;
    windowEnd: number;
    side: AlarmSide;
    value: number;
    plotValue: number;
    rawValue: number;
    limit: number;
    centerline: number;
    baselineLabel: string;
    explanation: string;
}

export interface ChartResult {
    mode: ChartMode;
    points: CalculatedPoint[];
    alarms: Alarm[];
    series: string[];
    formula: string;
    droppedRows: number;
    receivedRows: number;
    hasHighlights: boolean;
    dataStatus: DataStatus;
    hasMoreData: boolean;
    specificationLower?: number;
    specificationUpper?: number;
}

export interface CalculationOptions {
    mode: ChartMode;
    sigmaMultiplier: number;
    twoSigmaMultiplier?: number;
    shiftLength: number;
    trendLength: number;
    joinRebaselineRules: boolean;
    enableOutside3Sigma?: boolean;
    enableTwoOfThree?: boolean;
    enableShift?: boolean;
    enableTrend?: boolean;
    specificationLower?: number;
    specificationUpper?: number;
    locale?: string;
}

export interface RuleOptions {
    sigmaMultiplier: number;
    twoSigmaMultiplier?: number;
    shiftLength?: number;
    trendLength?: number;
    resetOnBaselineChange: boolean;
    enableOutside3Sigma?: boolean;
    enableTwoOfThree?: boolean;
    enableShift?: boolean;
    enableTrend?: boolean;
    mode?: ChartMode;
    locale?: string;
}

export interface VisualSettings extends CalculationOptions {
    direction: Direction;
    showBands: boolean;
    showControlLimits: boolean;
    showCenterline: boolean;
    showAxes: boolean;
    showSpecificationLimits: boolean;
    showAlarmTable: boolean;
    showPoints: boolean;
    pointSize: number;
    lineWidth: number;
    fontSize: number;
    axisTickCount: number;
    controlLineStyle: LineStyle;
    centerlineLineStyle: LineStyle;
    specificationLineStyle: LineStyle;
    controlColor?: string;
    centerlineColor?: string;
    specificationColor?: string;
    pointColor?: string;
    alarmColor?: string;
    axisColor?: string;
    textColor?: string;
    backgroundColor?: string;
}
