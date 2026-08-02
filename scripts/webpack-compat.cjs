const { Logger } = require("webpack/lib/logging/Logger");

const originalTimeEnd = Logger.prototype.timeEnd;
Logger.prototype.timeEnd = function timeEnd(label) {
    try {
        return originalTimeEnd.call(this, label);
    } catch (error) {
        if (error instanceof Error && error.message === `No such label '${label}' for WebpackLogger.timeEnd()`) {
            return undefined;
        }
        throw error;
    }
};
