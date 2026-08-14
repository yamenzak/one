/**
 * THE CHART VOCABULARY — nine forms, five figures, and the arithmetic under them.
 *
 * ⚠️ THE ORDER TO REACH FOR THEM IN IS THE ORDER THEY ARE LISTED. A single value
 * is a `Stat`; the number a screen exists for is a `Hero`; a ratio against a
 * limit is a `Meter`. Only when the SHAPE of a change is the point does a chart
 * earn its place — and then the data's job picks the form, not taste:
 *
 *   magnitude across categories .... BarChart (or ColumnChart for a few / time)
 *   trend over time ................ LineChart, or AreaChart for one series
 *   telling series apart ........... LineChart / StackedChart (categorical hues)
 *   one series is the story ........ any of them with `subject` — emphasis
 *   which side of a baseline ....... DivergingChart
 *   part-to-whole .................. StackedChart
 *   before and after ............... DumbbellChart
 *   a grid of magnitudes ........... HeatmapChart
 *   two measures against each other  ScatterChart (three series, hard cap)
 *   the shape beside a number ...... Sparkline
 */

export * from "./scale.js";
export * from "./palette.js";
export * from "./charts.js";
export * from "./figures.js";
