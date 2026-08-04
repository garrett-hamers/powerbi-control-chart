/**
 * `src/visual.ts` imports the Less entry point so webpack's MiniCssExtractPlugin emits the
 * stylesheet into the packaged visual. The import has no runtime value, so it is declared
 * as an opaque module.
 */
declare module "*.less";
