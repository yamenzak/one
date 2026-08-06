/**
 * Source-binding runtime (§sources). A widget can bind fields (a metric's value,
 * a menu's rows, a text string, …) to dynamic data sources; this poller fetches
 * each bound source's normalized {columns,rows} dataset and re-renders the widget
 * whenever the data changes. Same fetch-and-hold resilience as the other pollers:
 * a transient failure keeps the last good render.
 */
import type { SourceDataset } from "@scena/widgets";
import { API_BASE } from "./config.js";
import { diagReport } from "./diag.js";

const POLL_MS = 60_000;

export class SourceBinder {
  private poll: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private readonly datasets: Record<string, SourceDataset | undefined> = {};
  private lastKey = "";

  constructor(
    private readonly sourceIds: string[],
    private readonly rebind: (ds: Record<string, SourceDataset | undefined>) => void,
  ) {}

  start(): void {
    void this.refresh();
    this.poll = setInterval(() => void this.refresh(), POLL_MS);
  }

  close(): void {
    this.closed = true;
    if (this.poll) clearInterval(this.poll);
  }

  private async refresh(): Promise<void> {
    if (this.closed) return;
    await Promise.all(
      this.sourceIds.map(async (id) => {
        try {
          const res = await fetch(`${API_BASE}/api/feeds/${id}/data`);
          if (!res.ok) { diagReport(`source:${id}`, { kind: "source", label: `source · ${id}`, ok: false, detail: `http ${res.status}` }); return; }
          const { dataset } = (await res.json()) as { dataset?: SourceDataset };
          if (dataset) this.datasets[id] = dataset;
          const rows = dataset?.rows?.length ?? 0;
          diagReport(`source:${id}`, { kind: "source", label: `source · ${id}`, ok: rows > 0, detail: rows ? `${rows} rows` : "empty" });
        } catch {
          diagReport(`source:${id}`, { kind: "source", label: `source · ${id}`, ok: false, detail: "offline" });
          /* keep last good dataset for this source */
        }
      }),
    );
    // Only re-render when something actually changed.
    const key = JSON.stringify(this.datasets);
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (!this.closed) this.rebind(this.datasets);
  }
}
