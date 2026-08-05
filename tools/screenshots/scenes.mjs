import { buildDataView } from "./sample-data.mjs";

/**
 * Screenshot scenes for the AppSource listing. Each scene is a real render of the
 * *packaged* visual over the committed offline sample data - nothing here draws or fakes
 * chart output.
 */
export const SCENES = [
    {
        id: "01-individuals-control-limits",
        heading: "Individuals chart with auditable control limits",
        caption: "Thirty-six days of emergency-department door-to-doctor time. The centre line and the "
            + "three-sigma control limits come from the mean moving range, the one and two sigma bands are "
            + "drawn behind the series, and the formula used is printed under the chart.",
        dataView: () => buildDataView({
            objects: {
                chart: { mode: "individuals" },
                limits: { showBands: true, showControlLimits: true, showCenterline: true },
                // The alarm table is scene 2's subject; hiding it here gives the chart the full frame.
                accessibility: { showAlarmTable: false },
                typography: { fontSize: 14 },
                points: { size: 5, lineWidth: 2 }
            }
        }),
        expectAlarms: true,
        expectAlarmTable: false
    },
    {
        id: "02-rule-violations-and-alarm-table",
        heading: "Every signal explained, in text as well as pixels",
        caption: "Nelson-style detection on the same data: a point beyond three sigma, two of three beyond "
            + "two sigma, an eight-point shift, and a six-point trend. Every signal is repeated in a "
            + "keyboard-reachable summary table with the value, the limit it crossed, and a plain-language "
            + "explanation a screen reader can read out.",
        dataView: () => buildDataView({
            objects: {
                chart: { mode: "individuals", direction: "lowerIsBetter" },
                limits: { showBands: true, showControlLimits: true, showCenterline: true },
                rules: {
                    enableOutside3Sigma: true,
                    enableTwoOfThree: true,
                    enableShift: true,
                    enableTrend: true,
                    shiftLength: 8,
                    trendLength: 6
                },
                accessibility: { showAlarmTable: true },
                specificationLimits: { show: true, upper: 40 },
                typography: { fontSize: 14 },
                points: { size: 5, lineWidth: 2 }
            }
        }),
        expectAlarms: true,
        expectAlarmTable: true
    },
    {
        id: "03-attribute-chart-variable-limits",
        heading: "Attribute charts with per-subgroup control limits",
        caption: "The same visual as a P chart: target breaches over patients seen. Every day has a different "
            + "denominator, so the control limits are recomputed for each subgroup and step with the sample "
            + "size instead of being flattened into one straight line.",
        dataView: () => buildDataView({
            attribute: true,
            objects: {
                chart: { mode: "p", direction: "lowerIsBetter" },
                limits: { showBands: false, showControlLimits: true, showCenterline: true },
                accessibility: { showAlarmTable: true },
                typography: { fontSize: 14 },
                points: { size: 5, lineWidth: 2 }
            }
        }),
        expectAlarms: false,
        expectAlarmTable: true
    }
];

export const SCENE_IDS = SCENES.map((scene) => scene.id);
