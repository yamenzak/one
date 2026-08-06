/**
 * Weather widget on the screen (BLUEPRINT §17).
 *
 * Weather is a server-side source: this widget just polls the API's cached
 * conditions for its location and renders one of several variants. It never
 * touches OpenWeather (the key stays on the server) and the whole fleet shares
 * one cached fetch per location. Offline it holds the last render.
 */

import { API_BASE } from "./config.js";
import { diagReport } from "./diag.js";
import { weatherBodyHtml, applyWeatherUnits, type WeatherVariant, type WeatherData } from "@scena/widgets";

export type { WeatherVariant };

const POLL_MS = 5 * 60_000; // conditions change slowly; the server caches upstream

export class WeatherWidget {
  private timer: ReturnType<typeof setInterval> | 0 = 0;
  private closed = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly sourceId: string,
    private readonly variant: WeatherVariant,
    private readonly h: number = 320,
    private readonly units: string = "",
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  private async tick(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/weather/${this.sourceId}/current`);
      if (!res.ok) { diagReport(`weather:${this.sourceId}`, { kind: "weather", label: `weather · ${this.sourceId}`, ok: false, detail: `http ${res.status}` }); return; }
      const raw = (await res.json()) as WeatherData & { mock?: boolean };
      const data = applyWeatherUnits(raw, this.units);
      const mock = raw.mock ? " (mock — set OpenWeather key)" : "";
      diagReport(`weather:${this.sourceId}`, { kind: "weather", label: `weather · ${data.label || this.sourceId}`, ok: !raw.mock, detail: `${Math.round(data.current.temp)}° ${data.current.condition}${mock}`.trim() });
      // Shared, design-px renderer → byte-identical to the builder preview (§17).
      if (!this.closed) this.el.innerHTML = weatherBodyHtml(this.variant, data, this.h);
    } catch {
      diagReport(`weather:${this.sourceId}`, { kind: "weather", label: `weather · ${this.sourceId}`, ok: false, detail: "offline" });
      /* offline — keep the last render */
    }
  }
}
