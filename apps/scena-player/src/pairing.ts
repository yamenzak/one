/**
 * Fullscreen pairing surface shown until an operator claims this screen (§6),
 * plus a success flourish when it pairs. Vanilla DOM + injected keyframes so it
 * cold-boots instantly. Scena the mascot fronts each state — searching while it
 * waits for a code, delighted when it pairs, thinking while it reconnects.
 */

import { scenaMascotSvg, type ScenaMood } from "@scena/brand";

/** Scena at a given mood, sized to a responsive hero. */
function mascot(mood: ScenaMood, delay = 0): string {
  return `<div style="width:clamp(116px,16vh,176px);height:clamp(116px,16vh,176px);animation:scena-rise .6s ${delay}s both;">${scenaMascotSvg({ mood })}</div>`;
}

/** The Scena wordmark lockup (used under the mascot). */
const WORDMARK = `<div style="display:flex;align-items:center;gap:9px;animation:scena-rise .55s .08s both;">
  <span style="font-size:24px;font-weight:800;letter-spacing:-.02em;color:#fff;">scena</span>
</div>`;

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes scena-orb { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-30px) scale(1.1)} 66%{transform:translate(-30px,20px) scale(.95)} 100%{transform:translate(0,0) scale(1)} }
    @keyframes scena-rise { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
    @keyframes scena-dot { 0%,80%,100%{opacity:.25;transform:scale(.9)} 40%{opacity:1;transform:scale(1)} }
    @keyframes scena-burst { 0%{transform:scale(.3);opacity:.9} 100%{transform:scale(2.7);opacity:0} }
    @keyframes scena-check { to{stroke-dashoffset:0} }
    @keyframes scena-pop { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
    @keyframes scena-spin { to{transform:rotate(360deg)} }
    #scena-refresh:hover{background:rgba(255,255,255,.12)!important;border-color:rgba(180,150,235,.4)!important}
    #scena-refresh:active{transform:scale(.97)}
    #scena-refresh.busy svg{animation:scena-spin .7s linear infinite}
  `;
  document.head.appendChild(s);
}

const BG = "radial-gradient(circle at 50% 28%, #241338 0%, #150a24 46%, #08060f 100%)";
const ORBS = `
  <div style="position:absolute;width:540px;height:540px;border-radius:50%;top:-150px;left:-130px;background:radial-gradient(circle,rgba(150,80,230,.28),transparent 70%);filter:blur(34px);animation:scena-orb 18s ease-in-out infinite;"></div>
  <div style="position:absolute;width:440px;height:440px;border-radius:50%;bottom:-130px;right:-110px;background:radial-gradient(circle,rgba(80,120,230,.22),transparent 70%);filter:blur(34px);animation:scena-orb 24s ease-in-out infinite reverse;"></div>`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function dots(size = 6): string {
  return [0, 0.2, 0.4]
    .map((d) => `<span style="width:${size}px;height:${size}px;border-radius:50%;background:#a78bfa;animation:scena-dot 1.4s ${d}s infinite;"></span>`)
    .join("");
}

/**
 * The pairing surface. `onRefresh`, when supplied, adds a "Refresh code" button
 * that asks for a brand-new pairing code — the operator's escape hatch when the
 * shown code won't claim (e.g. it expired, or it's a stale code after an unpair).
 */
export function renderPairing(stage: HTMLElement, code: string, statusText: string, onRefresh?: () => void): void {
  injectStyle();
  const chars = code
    .split("")
    .map(
      (ch, i) => `
      <div style="animation:scena-rise .55s ${0.06 * i}s both;width:clamp(64px,7vw,104px);height:clamp(84px,9vw,132px);border-radius:18px;
                  display:flex;align-items:center;justify-content:center;
                  font-family:'JetBrains Mono',monospace;font-size:clamp(44px,5vw,72px);font-weight:600;color:#fff;
                  background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));
                  border:1px solid rgba(180,150,235,.25);
                  box-shadow:0 12px 44px rgba(120,60,220,.18), inset 0 1px 0 rgba(255,255,255,.12);">${escapeHtml(ch)}</div>`,
    )
    .join("");
  stage.innerHTML = `
    <div style="position:absolute;inset:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(16px,3vh,30px);background:${BG};color:#fff;">
      ${ORBS}
      ${mascot("searching")}
      ${WORDMARK}
      <div style="text-align:center;animation:scena-rise .55s .12s both;">
        <div style="font-size:clamp(18px,2.4vw,24px);font-weight:600;margin-bottom:6px;">Pair this screen</div>
        <div style="font-size:15px;color:#b9a9d6;">Enter this code in your Scena dashboard</div>
      </div>
      <div style="display:flex;gap:clamp(10px,1.4vw,18px);">${chars}</div>
      <div style="display:flex;align-items:center;gap:8px;color:#8a7ab0;font-size:13px;font-family:'JetBrains Mono',monospace;animation:scena-rise .55s .2s both;">
        ${dots()}<span style="margin-left:6px;">${escapeHtml(statusText)}</span>
      </div>
      ${onRefresh ? `
      <button id="scena-refresh" type="button" aria-label="Refresh pairing code"
        style="margin-top:2px;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;
               background:rgba(255,255,255,.06);border:1px solid rgba(180,150,235,.22);color:#cbbdea;
               font:600 13.5px system-ui,sans-serif;cursor:pointer;transition:background .15s,border-color .15s;
               animation:scena-rise .55s .3s both;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
        Refresh code
      </button>` : ""}
    </div>`;
  if (onRefresh) {
    const btn = stage.querySelector<HTMLButtonElement>("#scena-refresh");
    btn?.addEventListener("click", () => {
      btn.classList.add("busy");
      btn.disabled = true;
      btn.style.cursor = "default";
      onRefresh();
    });
  }
}

/** Success flourish when the screen is claimed — Scena lights up (broadcaster +
 *  cheerful) inside a soft burst. */
export function renderPaired(stage: HTMLElement, name?: string): void {
  injectStyle();
  stage.innerHTML = `
    <div style="position:absolute;inset:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:${BG};color:#fff;">
      ${ORBS}
      <div style="position:relative;width:clamp(150px,20vh,210px);height:clamp(150px,20vh,210px);display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(52,211,153,.4),transparent 62%);animation:scena-burst .9s ease-out forwards;"></div>
        <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(52,211,153,.32),transparent 62%);animation:scena-burst 1.1s .15s ease-out forwards;"></div>
        <div style="width:100%;height:100%;animation:scena-pop .5s cubic-bezier(.2,.8,.2,1) both;">${scenaMascotSvg({ mood: "happy" })}</div>
      </div>
      <div style="text-align:center;animation:scena-rise .55s .3s both;">
        <div style="font-size:clamp(24px,3vw,32px);font-weight:700;">Paired${name ? ` · ${escapeHtml(name)}` : ""}</div>
        <div style="font-size:15px;color:#9fb8ad;margin-top:6px;">Loading your channel…</div>
      </div>
    </div>`;
}

export function renderConnecting(stage: HTMLElement, text: string): void {
  injectStyle();
  stage.innerHTML = `
    <div style="position:absolute;inset:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:${BG};color:#8a7ab0;font-family:'JetBrains Mono',monospace;font-size:14px;">
      ${ORBS}
      ${mascot("thinking")}
      <div style="display:flex;gap:7px;">${dots(8)}</div>
      ${escapeHtml(text)}
    </div>`;
}
