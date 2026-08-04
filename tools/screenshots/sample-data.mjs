/**
 * Deterministic, fully offline sample data for the Atlyn Control Chart submission assets.
 *
 * The same module feeds the browser screenshot harness and the committed PBIP sample
 * report, so the listing screenshots and the sample report can never drift apart.
 *
 * Scenario: emergency department door-to-doctor time in minutes, measured once per day
 * across forty consecutive days. The process runs in control for the first three weeks,
 * then a single special-cause spike is followed by a sustained upward drift, so a real
 * render shows control limits, sigma bands, and the rules the visual implements:
 * a point outside the control limits, two-of-three beyond two sigma, a shift, and a trend.
 */

export const TIME_DISPLAY_NAME = "Day";
export const VALUE_DISPLAY_NAME = "Door-to-doctor (minutes)";
export const VALUE_FORMAT = "0.0";
export const PHASE_DISPLAY_NAME = "Phase";
export const DENOMINATOR_DISPLAY_NAME = "Patients seen";
export const DEFECTS_DISPLAY_NAME = "Target breaches";

/** Names used by the PBIP semantic model and the PBIR field bindings. */
export const TABLE_NAME = "Observations";
export const TIME_COLUMN = "Day";
export const VALUE_COLUMN = "Minutes";

const BASELINE_DAYS = 28;
const START_DAY = Date.UTC(2026, 4, 4); // 2026-05-04, a Monday.
const DAY_MS = 86400000;

/**
 * Deliberate, real observations placed at fixed day indexes. The spike is a genuine
 * special cause and the tail is a genuine upward drift; nothing here is decoration.
 */
const SPECIAL_CAUSE = {
    28: 39.8,
    29: 34.2,
    30: 34.6,
    31: 35.1,
    32: 35.6,
    33: 36.2,
    34: 36.8,
    35: 37.4
};

const BASELINE_MEAN = 32;
const BASELINE_SPREAD = 1.9;
const SEED = 20260504;

export const DAY_COUNT = BASELINE_DAYS + Object.keys(SPECIAL_CAUSE).length;

function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** Bates(4) transform: deterministic, bounded, and close enough to normal. */
function standardScore(random) {
    return (random() + random() + random() + random() - 2) * Math.sqrt(3);
}

const round1 = (value) => Math.round(value * 10) / 10;

export function dayLabel(index) {
    return new Date(START_DAY + index * DAY_MS).toISOString().slice(0, 10);
}

/**
 * @returns {Array<{ day: string, minutes: number, phase: string, patients: number, breaches: number }>}
 */
export function buildSampleRows() {
    const random = createRandom(SEED);
    const rows = [];
    for (let index = 0; index < DAY_COUNT; index += 1) {
        const injected = SPECIAL_CAUSE[index];
        const minutes = injected === undefined
            ? round1(BASELINE_MEAN + standardScore(random) * BASELINE_SPREAD)
            : injected;
        // Attribute-chart companion series: how many of the day's patients breached target.
        const patients = 90 + ((index * 7) % 31);
        const breaches = Math.max(1, Math.round((patients * (minutes - 26)) / 120));
        rows.push({
            day: dayLabel(index),
            minutes,
            phase: index < BASELINE_DAYS ? "Baseline" : "Post-change",
            patients,
            breaches
        });
    }
    return rows;
}

function categoryColumn(displayName, queryName, role, values) {
    return {
        source: { displayName, queryName, roles: { [role]: true }, type: { text: true } },
        values,
        identity: values.map((value, index) => ({ key: `${role}:${index}:${value}` }))
    };
}

function valueColumn(displayName, queryName, role, values, format) {
    return {
        source: {
            displayName,
            queryName,
            roles: { [role]: true },
            format,
            type: { numeric: true }
        },
        values
    };
}

/**
 * Builds the categorical DataView the visual consumes in a real host.
 *
 * @param {{
 *   includePhase?: boolean,
 *   attribute?: boolean,
 *   objects?: Record<string, Record<string, unknown>>
 * }} [options]
 */
export function buildDataView(options = {}) {
    const rows = buildSampleRows();
    const categories = [
        categoryColumn(TIME_DISPLAY_NAME, "Observations.Day", "Time", rows.map((row) => row.day))
    ];
    if (options.includePhase) {
        categories.push(
            categoryColumn(PHASE_DISPLAY_NAME, "Observations.Phase", "BaselineGroup", rows.map((row) => row.phase))
        );
    }

    const values = options.attribute
        ? [
            valueColumn(DEFECTS_DISPLAY_NAME, "Observations.Breaches", "Value", rows.map((row) => row.breaches), "0"),
            valueColumn(
                DENOMINATOR_DISPLAY_NAME,
                "Observations.Patients",
                "Denominator",
                rows.map((row) => row.patients),
                "0"
            )
        ]
        : [
            valueColumn(
                VALUE_DISPLAY_NAME,
                "Observations.Minutes",
                "Value",
                rows.map((row) => row.minutes),
                VALUE_FORMAT
            )
        ];

    return {
        metadata: {
            columns: [...categories.map((column) => column.source), ...values.map((column) => column.source)],
            objects: options.objects ?? {}
        },
        categorical: { categories, values }
    };
}
