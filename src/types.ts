import powerbi from "powerbi-visuals-api";

export type ChartMode = "individuals" | "run" | "p" | "u" | "c";
export type Direction = "both" | "higherIsBetter" | "lowerIsBetter" | "neutral";
export type AlarmSide = "high" | "low" | "both";
export type RuleName = "outside3Sigma" | "twoOfThree" | "shift" | "trend";
export type SpecificationStatus = "within" | "below" | "above" | "notConfigured";

export interface ChartRow {
    index: number;
    time: string;
    value: number;
    denominator?: number;
    seriesKey: string;
    seriesLabel: string;
    baselineKey: string;
    baselineLabel: string;
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
}

export interface CalculatedPoint extends ChartRow, PointStatistics {
    specificationStatus: SpecificationStatus;
    alarms: RuleName[];
}

export interface Alarm {
    id: string;
    rule: RuleName;
    seriesKey: string;
    seriesLabel: string;
    pointIndex: number;
    pointIndices: number[];
    windowStart: number;
    windowEnd: number;
    side: AlarmSide;
    value: number;
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
    specificationLower?: number;
    specificationUpper?: number;
}

export interface CalculationOptions {
    mode: ChartMode;
    sigmaMultiplier: number;
    shiftLength: number;
    trendLength: number;
    joinRebaselineRules: boolean;
    specificationLower?: number;
    specificationUpper?: number;
}

export interface RuleOptions {
    sigmaMultiplier: number;
    shiftLength: number;
    trendLength: number;
    resetOnBaselineChange: boolean;
}

export interface VisualSettings extends CalculationOptions {
    direction: Direction;
    showBands: boolean;
    showSpecificationLimits: boolean;
    showAlarmTable: boolean;
}
