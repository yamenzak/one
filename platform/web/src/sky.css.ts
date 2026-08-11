/**
 * THE SKY — the light behind the top of a page.
 *
 * ⚠️ IT IS ONE MECHANISM AND SEVERAL WORDS, NOT SEVERAL BACKGROUNDS. Every
 * variant below is the SAME two layers — a colour field and a filament field —
 * differing only in how each is drawn and masked. That is what keeps a new sky
 * from being a new pile of gradients somebody has to keep in step with the rest.
 *
 * ⚠️ THE HUE IS ONE NUMBER. `--sky-h` tints every layer, so a product or a
 * tenant re-colours the whole field by setting one value rather than editing
 * gradients. Nothing here names a colour except through it.
 *
 * ⚠️ IT HAS NO BOTTOM EDGE. The field is masked to nothing before it ends. A
 * hard bottom is the single thing that most makes a hero read as a banner pasted
 * onto a page instead of light falling on it.
 *
 * ⚠️ MOTION IS TRANSFORM AND OPACITY, NEVER background-position. One is
 * composited and one repaints the whole layer every frame; over a fifty-second
 * cycle nobody sees the difference in motion and every device sees it in
 * battery. The two layers drift in OPPOSITE directions, which is what reads as
 * depth rather than as a picture sliding.
 */

/** The skies a page may ask for. Closed: a page picks a word, not a gradient. */
export const SKIES = ["silk", "aurora", "mesh", "beams", "dots", "grid"] as const;
export type Sky = (typeof SKIES)[number];

export const SKY_CSS = `
/* ⚠️ FULL-BLEED, ALWAYS. The page is a capped column; the light is not — a band
   the width of the text column reads as an image in the layout rather than as
   the ground the layout is standing on. */
.sky { position: absolute; inset-block-start: 0; inset-inline-start: 50%;
  translate: -50% 0; inline-size: 100vw; block-size: 360px;
  z-index: 0; pointer-events: none; overflow: hidden;
  --sky-h: 224;
  /* ⚠️ A PALE GROUND TAKES FAR LESS OF IT. Light has almost no headroom below
     it, so the field that reads as light on black reads as PAINT on white — a
     coloured header rather than something falling on the page. One number on
     the layer, not a second set of gradients, and it sits on the sky itself so
     a variant animating its children's opacity is unaffected. */
  opacity: 0.34;
  -webkit-mask-image: linear-gradient(to bottom, #000 38%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 38%, transparent 100%); }

@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) .sky { opacity: 1; } }
:root[data-theme='dark'] .sky { opacity: 1; }

/* ⚠️ BOTH LAYERS ARE OVERSIZED AND ROTATED. A rotated layer at its own size
   leaves bare corners, and the bare corner is on a black page the one thing that
   gives away that this is a rectangle with a picture in it. */
.sky::before, .sky::after { content: ""; position: absolute; inset: -45%;
  will-change: transform; }

/* ------------------------------------------------------------------- silk --- */

/* ⚠️ A RIBBON IS A VERY FLAT ELLIPSE. A round bloom reads as a lamp; the same
   gradient at a tenth of its height reads as light along a fold of fabric, and
   four of them at slightly different angles read as a surface. */
.sky[data-sky='silk']::before {
  /* ⚠️ THE FIELD IS BIASED, NOT EVEN. Spread across the whole width it reads as a
     coloured header; concentrated to one side with the rest falling to black it
     reads as a light source somewhere off the screen, which is what the
     reference is and what makes the black look deliberate. */
  background:
    radial-gradient(26% 5% at 68% 25%, hsl(var(--sky-h) 98% 84% / 0.62), transparent 70%),
    radial-gradient(56% 9% at 76% 33%, hsl(var(--sky-h) 95% 58% / 0.5), transparent 74%),
    radial-gradient(84% 13% at 94% 50%, hsl(var(--sky-h) 93% 46% / 0.42), transparent 76%),
    radial-gradient(66% 10% at 44% 10%, hsl(var(--sky-h) 91% 40% / 0.3), transparent 78%),
    radial-gradient(96% 52% at 80% 20%, hsl(var(--sky-h) 93% 26% / 0.55), transparent 78%);
  transform: rotate(-11deg);
  animation: sky-flow 54s ease-in-out infinite alternate;
}
/* ⚠️ THE FILAMENTS ARE WHAT MAKES IT SILK. Without them the field is a blur, and
   a blur reads as an out-of-focus photograph rather than as a material. They are
   hairlines at the same angle as the ribbons, masked so they appear only where
   the light is — a filament crossing the black is a scratch. */
.sky[data-sky='silk']::after {
  /* ⚠️ FEW, AND ONLY WHERE THE LIGHT IS. Closely spaced they read as scratches
     on the black rather than as strands catching a light; the mask is what keeps
     them inside the lit region, and the wide period is what keeps them countable
     rather than a texture. */
  background: repeating-linear-gradient(
    to bottom,
    transparent 0 74px,
    hsl(var(--sky-h) 100% 88% / 0.26) 74px 74.7px,
    transparent 74.7px 148px);
  -webkit-mask-image: radial-gradient(52% 26% at 70% 30%, #000, transparent 70%);
  mask-image: radial-gradient(52% 26% at 70% 30%, #000, transparent 70%);
  transform: rotate(-13deg);
  animation: sky-counter 68s ease-in-out infinite alternate;
}

/* ----------------------------------------------------------------- aurora --- */

/* ⚠️ THREE BROAD SOURCES, NOT A WASH. A flat tint reads as a screen somebody
   coloured in; sources with wide falloff read as light in a room, and that is
   the whole difference between ambience and paint. */
.sky[data-sky='aurora']::before {
  background:
    radial-gradient(50% 44% at 16% 20%, hsl(var(--sky-h) 94% 60% / 0.62), transparent 68%),
    radial-gradient(46% 38% at 84% 28%, hsl(calc(var(--sky-h) + 30) 92% 54% / 0.55), transparent 70%),
    radial-gradient(62% 48% at 50% 64%, hsl(var(--sky-h) 90% 44% / 0.48), transparent 74%);
  animation: sky-flow 58s ease-in-out infinite alternate;
}
.sky[data-sky='aurora']::after { display: none; }

/* ------------------------------------------------------------------- mesh --- */

/* ⚠️ THE SAME LIGHT, SPREAD. Five sources across the whole field rather than
   three at the top, so it survives further down — which is what a long screen
   needs and what three blooms give out on. */
.sky[data-sky='mesh']::before {
  background:
    radial-gradient(34% 28% at 8% 16%, hsl(var(--sky-h) 92% 56% / 0.4), transparent 64%),
    radial-gradient(30% 26% at 60% 6%, hsl(calc(var(--sky-h) + 32) 90% 50% / 0.34), transparent 62%),
    radial-gradient(36% 30% at 96% 30%, hsl(var(--sky-h) 88% 46% / 0.36), transparent 66%),
    radial-gradient(40% 32% at 28% 58%, hsl(calc(var(--sky-h) - 18) 88% 44% / 0.32), transparent 68%),
    radial-gradient(32% 28% at 80% 74%, hsl(var(--sky-h) 90% 42% / 0.3), transparent 64%);
  animation: sky-flow 62s ease-in-out infinite alternate, sky-swell 41s ease-in-out infinite;
}
.sky[data-sky='mesh']::after { display: none; }

/* ------------------------------------------------------------------ beams --- */

/* ⚠️ SHAFTS ARE SOFT-EDGED, which is the whole difference between light through
   a window and a set of bars. The stops ramp rather than switching. */
.sky[data-sky='beams']::before {
  /* ⚠️ A SHAFT RAMPS, IT DOES NOT SWITCH. Hard stops are bars across a window;
     the ramp is the whole difference between light coming through and a fence.
     The mask keeps them from all arriving at once, which is what a repeating
     gradient does and light does not. */
  background: repeating-linear-gradient(99deg,
    transparent 0 44px,
    hsl(var(--sky-h) 92% 50% / 0.1) 62px,
    hsl(var(--sky-h) 97% 68% / 0.3) 78px,
    hsl(var(--sky-h) 92% 50% / 0.1) 94px,
    transparent 112px 196px);
  -webkit-mask-image: radial-gradient(78% 60% at 62% 26%, #000, transparent 76%);
  mask-image: radial-gradient(78% 60% at 62% 26%, #000, transparent 76%);
  animation: sky-flow 56s ease-in-out infinite alternate;
}
.sky[data-sky='beams']::after { display: none; }

/* ------------------------------------------------------------ dots · grid --- */

/* ⚠️ A PATTERN IS THE SAME LIGHT UNDER A MASK, never a second gradient. There is
   no colour decision to get wrong in a pattern, because there is no colour in
   the pattern — it is the aurora with holes in it. */
.sky[data-sky='dots']::before, .sky[data-sky='grid']::before {
  background:
    radial-gradient(48% 40% at 22% 24%, hsl(var(--sky-h) 96% 62% / 0.85), transparent 66%),
    radial-gradient(44% 36% at 78% 40%, hsl(calc(var(--sky-h) + 24) 94% 56% / 0.7), transparent 68%);
  animation: sky-flow 60s ease-in-out infinite alternate;
}
.sky[data-sky='dots']::before {
  -webkit-mask-image: radial-gradient(circle, #000 1.2px, transparent 1.4px);
  mask-image: radial-gradient(circle, #000 1.2px, transparent 1.4px);
  -webkit-mask-size: 10px 10px; mask-size: 10px 10px;
}
.sky[data-sky='grid']::before {
  -webkit-mask-image: repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 26px),
                      repeating-linear-gradient(90deg, #000 0 1px, transparent 1px 26px);
  mask-image: repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 26px),
              repeating-linear-gradient(90deg, #000 0 1px, transparent 1px 26px);
}
.sky[data-sky='dots']::after, .sky[data-sky='grid']::after { display: none; }

/* ------------------------------------------------------------- the weather --- */

/* ⚠️ SLOW ENOUGH TO BE WEATHER. Under about thirty seconds it reads as an
   animation somebody added; past about forty-five it reads as light changing in
   a room, which is the point. The reference moves roughly a twelfth of its width
   in four seconds, which is this. */
@keyframes sky-flow {
  from { transform: translate3d(-3%, -1.5%, 0) scale(1.04) rotate(var(--sky-tilt, 0deg)); }
  to { transform: translate3d(3%, 1.5%, 0) scale(1.12) rotate(var(--sky-tilt, 0deg)); }
}
/* ⚠️ THE FILAMENTS RUN THE OTHER WAY. Two layers drifting together are one
   picture sliding; against each other they are a surface with depth. */
@keyframes sky-counter {
  from { transform: translate3d(2.5%, 1%, 0) scale(1.1) rotate(var(--sky-tilt, 0deg)); }
  to { transform: translate3d(-2.5%, -1%, 0) scale(1.02) rotate(var(--sky-tilt, 0deg)); }
}
/* ⚠️ OPACITY, so it may run BESIDE the drift. Two animations on one element must
   not both write a transform — the second wins outright and the drift silently
   stops. */
@keyframes sky-swell { 0%, 100% { opacity: 0.82; } 50% { opacity: 1; } }

.sky[data-sky='silk']::before { --sky-tilt: -11deg; }
.sky[data-sky='silk']::after { --sky-tilt: -13deg; }

/* ⚠️ REMOVED, NOT SLOWED. The light stays; only the weather stops. */
@media (prefers-reduced-motion: reduce) {
  .sky::before, .sky::after { animation: none; }
}
`.trim();
