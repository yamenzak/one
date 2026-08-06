/**
 * Live data for the builder preview (§17). Data-bound widgets (ticker / weather /
 * queue / rooms / source-bound text·metric·menu) render *representative* content
 * when nothing is bound, but the moment a node is bound to a real source we thread
 * its actual state into the same preview components — so the canvas shows the real
 * feed headlines, the real current conditions, the live "now serving" number, and
 * real source cells, not a placeholder. Weather + board state ride along on the
 * lists the builder already loads; source datasets are fetched on demand for the
 * sources actually in use (a ticker's feed, or any bound field).
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { stackItems, str, boundSourceIds, type SourceDataset } from "@scena/widgets";
import { getSourceData, type Board, type WeatherCurrent, type WeatherLocation } from "../api.js";
import type { WNode } from "./types.js";

export interface LiveData {
  /** Cached current conditions for a bound weather source, or null. */
  weather(sourceId: string): WeatherCurrent | null;
  /** Live board state for a bound board, or null. */
  board(boardId: string): Board | null;
  /** Fetched dataset for a source (a ticker's feed or a bound field), or null. */
  sourceData(sourceId: string): SourceDataset | null;
}

const EMPTY: LiveData = { weather: () => null, board: () => null, sourceData: () => null };
const Ctx = createContext<LiveData>(EMPTY);
export const useLiveData = () => useContext(Ctx);

/** Every source id the profile needs a dataset for: a ticker's feed, plus any
 *  field bound via config.bindings — recursing into stack items. */
function collectSourceIds(nodes: WNode[]): string[] {
  const ids = new Set<string>();
  const visit = (type: string, config: Record<string, unknown>) => {
    for (const id of boundSourceIds(config)) ids.add(id);
    if (type === "ticker") { const id = str(config.feedId); if (id) ids.add(id); }
    if (type === "stack") for (const it of stackItems(config)) visit(it.widget.type, it.widget.config);
  };
  for (const n of nodes) visit(n.type, n.config);
  return [...ids];
}

export function LiveDataProvider({
  nodes, weather, boards, children,
}: {
  nodes: WNode[];
  weather: WeatherLocation[];
  boards: Board[];
  children: ReactNode;
}) {
  const weatherMap = useMemo(() => {
    const m: Record<string, WeatherCurrent | null> = {};
    for (const w of weather) m[w.id] = w.current;
    return m;
  }, [weather]);
  const boardMap = useMemo(() => {
    const m: Record<string, Board> = {};
    for (const b of boards) m[b.id] = b;
    return m;
  }, [boards]);

  // Datasets for every source in use. Refetched when the set changes, so the
  // canvas shows real cells/headlines while authoring.
  const sourceIds = useMemo(() => collectSourceIds(nodes), [nodes]);
  const sourceKey = sourceIds.join(",");
  const [datasets, setDatasets] = useState<Record<string, SourceDataset>>({});
  useEffect(() => {
    let live = true;
    for (const id of sourceIds) {
      getSourceData(id).then((ds) => { if (live) setDatasets((m) => ({ ...m, [id]: ds })); }).catch(() => {});
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const value = useMemo<LiveData>(() => ({
    weather: (id) => weatherMap[id] ?? null,
    board: (id) => boardMap[id] ?? null,
    sourceData: (id) => datasets[id] ?? null,
  }), [weatherMap, boardMap, datasets]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
