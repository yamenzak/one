/**
 * THE SKY — the tenant's light, behind everything.
 *
 * ⚠️ THIS IS WHERE THE AMBIENCE SLOT LIVES, and until now it had nowhere to go.
 * The brand contract has carried a hue and an intensity since it was written, and
 * every screen spent it on a tint nobody could see. Here it is the ground: a slow
 * aurora behind the whole scroll, or a pattern lit by the same colour.
 *
 * ⚠️ IT IS NEVER A WASH. The colour arrives as BLOOMS on a dark ground — three
 * soft radial sources, low chroma, wide falloff — because a flat tint reads as a
 * screen somebody has coloured in, and blooms read as light in a room. That is
 * the whole difference between ambience and paint.
 *
 * ⚠️ AND THE HUE NEVER CYCLES. It is the tenant's, fixed. Motion is drift and
 * breath only — what moves is where the light falls, never what colour it is.
 * A hue that animates is a screensaver.
 */

/** The patterns a page may declare. ⚠️ Each is a MASK, so one lit layer serves all. */
export const SKIES = ["aurora", "dots", "waves", "grid", "rings", "photo"];

export const SKY_CSS = `
/*
  One lit layer, masked differently per sky. The colour is the tenant's; the mask
  is the page's. Nothing here names a colour.
*/
.backdrop{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;
  -webkit-mask-image:linear-gradient(to bottom,#000 var(--solid,28%),transparent var(--reach,60%));
  mask-image:linear-gradient(to bottom,#000 var(--solid,28%),transparent var(--reach,60%))}
.backdrop::before{content:"";position:absolute;inset:-14%;
  background:
    radial-gradient(48% 38% at 18% 10%, var(--sky-1), transparent 62%),
    radial-gradient(42% 34% at 84% 22%, var(--sky-2), transparent 64%),
    radial-gradient(58% 44% at 46% 52%, var(--sky-3), transparent 68%);
  /* ⚠️ TRANSFORM, NEVER background-position. One is composited on the GPU and one
     repaints the whole layer every frame — at 40s nobody sees the difference in
     motion, and every device sees it in battery. */
  animation:drift 52s var(--e-out) infinite alternate;
  will-change:transform}

/* ⚠️ SLOW ENOUGH TO BE WEATHER. Under ~30s it reads as an animation somebody
   added; past ~45s it reads as light changing in a room, which is the point. */
@keyframes drift{
  from{transform:translate3d(-2.5%,-1.5%,0) scale(1.06)}
  to{transform:translate3d(2.5%,1.5%,0) scale(1.13)}
}

/* ── THE PATTERNS. A mask over the same lit layer, so a pattern is never a
      colour decision — it takes the tenant's light like everything else.

   ⚠️ A MASKED SKY NEEDS MORE LIGHT, because only a fraction of it survives. Dots
   at 9px keep about 2% of their pixels; at the gradient's own brightness that is
   a pattern nobody can see, and the temptation is to raise the tenant's ambience
   — which washes every unmasked screen to fix one masked one. The light is
   raised HERE, where the mask is, and the brand slot is left alone. */
[data-theme='dark'] .backdrop[data-sky='dots']::before,[data-theme='dark'] .backdrop[data-sky='waves']::before,
[data-theme='dark'] .backdrop[data-sky='grid']::before,[data-theme='dark'] .backdrop[data-sky='rings']::before{
  filter:brightness(2.4) saturate(1.15)}
/* ⚠️ AND IN LIGHT IT GOES THE OTHER WAY. Raising the light on a pale ground
   blows the mask out to white — the pattern disappears for the opposite reason.
   A mask is legible by DISTANCE from its ground, so the correction follows the
   ground's direction rather than being a constant. */
[data-theme='light'] .backdrop[data-sky='dots']::before,[data-theme='light'] .backdrop[data-sky='waves']::before,
[data-theme='light'] .backdrop[data-sky='grid']::before,[data-theme='light'] .backdrop[data-sky='rings']::before{
  filter:brightness(.62) saturate(1.5)}
.backdrop[data-sky='dots']::before{
  -webkit-mask-image:radial-gradient(circle,#000 1.1px,transparent 1.3px);
  mask-image:radial-gradient(circle,#000 1.1px,transparent 1.3px);
  -webkit-mask-size:9px 9px;mask-size:9px 9px;
  animation:drift 52s var(--e-out) infinite alternate, breathe 26s ease-in-out infinite}
.backdrop[data-sky='waves']::before{
  -webkit-mask-image:repeating-linear-gradient(112deg,#000 0 2px,transparent 2px 13px);
  mask-image:repeating-linear-gradient(112deg,#000 0 2px,transparent 2px 13px);
  animation:drift 52s var(--e-out) infinite alternate, breathe 32s ease-in-out infinite}
.backdrop[data-sky='grid']::before{
  -webkit-mask-image:repeating-linear-gradient(0deg,#000 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,#000 0 1px,transparent 1px 22px);
  mask-image:repeating-linear-gradient(0deg,#000 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,#000 0 1px,transparent 1px 22px);
  animation:drift 52s var(--e-out) infinite alternate}
.backdrop[data-sky='rings']::before{
  -webkit-mask-image:repeating-radial-gradient(circle at 50% 8%,#000 0 1px,transparent 1px 26px);
  mask-image:repeating-radial-gradient(circle at 50% 8%,#000 0 1px,transparent 1px 26px);
  animation:drift 52s var(--e-out) infinite alternate, breathe 38s ease-in-out infinite}

/* ⚠️ THE PATTERN BREATHES; IT DOES NOT TRAVEL. A moving pattern is a texture
   somebody is dragging past the screen. Scaling the mask a few percent reads as
   the light moving over a surface that is standing still. */
@keyframes breathe{0%,100%{-webkit-mask-size:9px 9px;mask-size:9px 9px}50%{-webkit-mask-size:9.7px 9.7px;mask-size:9.7px 9.7px}}

/* ⚠️ A PHOTOGRAPH IS STILL A SKY, and it is the one that carries a whole screen. */
.backdrop[data-sky='photo']::before{
  background:
    radial-gradient(120% 80% at 20% 0%, var(--sky-deep), transparent 60%),
    radial-gradient(90% 60% at 85% 25%, var(--sky-2), transparent 55%),
    radial-gradient(70% 50% at 40% 55%, var(--sky-bloom), transparent 60%),
    linear-gradient(160deg, var(--sky-deep), var(--sky-1) 45%, var(--sky-bloom) 72%, var(--sky-deep))}

@media (prefers-reduced-motion:reduce){.backdrop::before{animation:none}}
`;
