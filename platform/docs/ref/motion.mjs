/* ═══════════════════════════════════════════════════════════════════════════
   THE MOTION SYSTEM — one clock, four durations, three curves.

   ⚠️ A COMPONENT NEVER HOLDS A DURATION. Every timing below is a token, so two
   things moving at once physically cannot disagree — which is the whole
   difference between an interface that feels built and one that feels assembled.

   ⚠️ LEAVING IS ALWAYS FASTER THAN ARRIVING. Nobody waits to watch something go.
   Symmetric durations are the single most common reason an app feels sluggish.

   ⚠️ REDUCED MOTION REMOVES MOVEMENT, NEVER INFORMATION. Opacity and colour
   survive; transforms do not. A person who turns it on must still see that
   something happened.
   ═══════════════════════════════════════════════════════════════════════════ */
export const MOTION = `
:root{
  --t-tap:calc(120ms * var(--film,1));    /* press. must read as instant */
  --t-move:calc(220ms * var(--film,1));   /* a thing changing place or state on screen */
  --t-enter:calc(320ms * var(--film,1));  /* something arriving */
  --t-exit:calc(170ms * var(--film,1));   /* something leaving */
  --e-out:cubic-bezier(.2,.8,.2,1);
  --e-in:cubic-bezier(.4,0,1,1);
  /* A real spring, in CSS. The overshoot is what makes a press feel physical
     rather than merely fast — it is the one place easing is not enough. */
  --e-spring:linear(0,.402 7.4%,.711 15.3%,.929 23.4%,1.008 28.5%,1.057 34.6%,1.062 41.6%,1.031 55.9%,.995 79.5%,1);
  --stagger:calc(40ms * var(--film,1));
  --film:1;   /* review only — multiplies every duration so motion can be judged */
}

/* ── 1. PRESS IS THE ONE UNIVERSAL. Everything pressable, the same answer. */
.row,.tile,.quick button,.circ,.pill-btn,.dock button,.notice .x{
  transition:transform var(--t-tap) var(--e-spring),background-color var(--t-move) var(--e-out);
  will-change:transform}
.row:active,.tile:active,.quick button:active,.circ:active,.pill-btn:active{transform:scale(.97)}
.row:active{background:rgb(255 255 255/.06)}
.quick button:active .glyph,.tile:active .sq{background:var(--well-hi)}

/* ── 2. ARRIVING IS STAGGERED; LEAVING IS NOT.
   Capped at six: past that a stagger stops reading as choreography and starts
   reading as the list being slow to load. */
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
/* ⚠️ nth-child ON THE SECTION LIST, NOT nth-of-type ON THE CARD. A card may
   be wrapped in a section that has a header, so counting by TYPE counts every
   div in the body — the delays land on the wrong elements and the stagger
   silently does nothing. It renders as "the animation is too subtle", which is
   the wrong diagnosis and leads to making the distance bigger. */
[data-enter] .body > *{animation:rise var(--t-enter) var(--e-out) both}
[data-enter] .body > *:nth-child(1){animation-delay:calc(var(--stagger)*1)}
[data-enter] .body > *:nth-child(2){animation-delay:calc(var(--stagger)*2)}
[data-enter] .body > *:nth-child(3){animation-delay:calc(var(--stagger)*3)}
[data-enter] .body > *:nth-child(4){animation-delay:calc(var(--stagger)*4)}
/* Capped: past six a stagger stops reading as choreography and starts reading
   as the list being slow to arrive. */
[data-enter] .body > *:nth-child(n+5){animation-delay:calc(var(--stagger)*5)}

/* ── 3. THE HERO LEADS. It is what the screen is about, so it arrives first and
   from further away — the only element allowed a longer distance. */
@keyframes lift{from{opacity:0;transform:translateY(-8px) scale(1.02)}to{opacity:1;transform:none}}
[data-enter] .hero-stack,[data-enter] .hero-title{animation:lift var(--t-enter) var(--e-out) both}
[data-enter] .quick button{animation:rise var(--t-enter) var(--e-out) both}
[data-enter] .quick button:nth-child(1){animation-delay:60ms}
[data-enter] .quick button:nth-child(2){animation-delay:100ms}
[data-enter] .quick button:nth-child(3){animation-delay:140ms}
[data-enter] .quick button:nth-child(4){animation-delay:180ms}

/* ── 4. THE TAB INDICATOR SLIDES; THE TABS DO NOT MOVE.
   Drawn as one element behind the row, positioned by the current index — so the
   travel is continuous instead of one pill fading out while another fades in. */
.dock{position:absolute;isolation:isolate}
.dock::before{content:"";position:absolute;z-index:-1;top:6px;bottom:6px;left:6px;
  width:calc((100% - 12px)/4);border-radius:var(--r-pill);background:rgb(255 255 255/.10);
  transform:translateX(calc(var(--at,0)*100%));
  transition:transform var(--t-move) var(--e-spring)}
.dock button[aria-current]{background:none}

/* ── 5. A SHEET ARRIVES FROM THE EDGE IT IS ATTACHED TO, and the scrim fades.
   Two elements, one duration: they must land together or the sheet appears to
   drag the scrim behind it. */
@keyframes scrim-in{from{opacity:0}to{opacity:1}}
@keyframes sheet-in{from{transform:translateY(100%)}to{transform:none}}
.scrim{position:absolute;inset:0;background:rgb(0 0 0/.55);z-index:5;
  animation:scrim-in var(--t-enter) var(--e-out) both}
.sheet{position:absolute;left:0;right:0;bottom:0;z-index:6;background:var(--card);
  border-radius:var(--r-card) var(--r-card) 0 0;padding:8px 0 20px;
  animation:sheet-in var(--t-enter) var(--e-out) both}
.grab{width:36px;height:4px;border-radius:999px;background:var(--ink-3);margin:4px auto 10px}

/* ── 6. A NUMBER THAT CHANGES ROLLS. It is the one piece of content on a screen
   that is worth animating, because the movement IS the information. */
@keyframes roll{from{opacity:0;transform:translateY(.35em)}to{opacity:1;transform:none}}
.amount.rolling{animation:roll var(--t-move) var(--e-out)}

/* ── 7. WAITING SHIMMERS, and the shimmer travels across the whole group rather
   than each bar running its own loop — one light source, as everywhere else. */
@keyframes sweep{to{background-position:200% 0}}
.skel{background:linear-gradient(100deg,var(--card) 40%,rgb(255 255 255/.07) 50%,var(--card) 60%);
  background-size:200% 100%;animation:sweep 1.4s linear infinite;border-radius:8px}

/* ── 8. THE ONE BLOCK THAT TURNS IT ALL OFF. */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:1ms!important;animation-delay:0ms!important;
    transition-duration:1ms!important}
  /* Information survives: the fade stays, the travel goes. */
  [data-enter] .card,[data-enter] .hero-stack,[data-enter] .quick button{animation:none;opacity:1}
}
`;
