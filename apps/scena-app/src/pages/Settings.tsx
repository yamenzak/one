/**
 * WORKSPACE SETTINGS — an index and a page per section (UI-LANGUAGE §7).
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * Three tabs over one long page: Account (one card), Brand kit (four stacked
 * cards, one of them a 30-row token grid), AI (two cards). The brand tab alone
 * was every colour decision the workspace has, under a single "Save brand" the
 * palette generator and the asset uploader did not go through — so the page had
 * three different save semantics in three adjacent cards and nothing said which
 * was which.
 *
 * Tabs cap at 2–4 before they truncate, put every sibling one flick from the
 * one you want, and force a whole section onto one page. The settings grammar
 * is an INDEX whose rows say what is inside, and a page per section whose rows
 * say the CURRENT VALUE — so "is multi-screen sync on" is a question you answer
 * by reading, not by opening the control that could change it.
 *
 * ── The section lives in the URL ────────────────────────────────────────────
 *
 * `?s=brand&sub=palette`, via the router this app already has. `useState` would
 * compile and look right and mean every section shares one address: Back leaves
 * Settings from three levels deep, nothing is linkable, and a reload always
 * lands on the index. Same reasoning as `@4dl/admin`'s console.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FONT_FAMILIES, DEFAULT_TOKENS } from "@scena/manifest";
import { Sparkles, Palette, MonitorPlay, Mail, Sliders, RotateCcw, Wand2, ImagePlus, Trash2, Loader2, Type } from "lucide-react";
import { Card, PageHeader, SaveBar, SectionDetail, Select, SettingsIndex, SettingsPage as SectionFrame, SkeletonLine, Stagger, toast, useAction, useConfirmedState, type SettingsEntry, usePageChrome } from "@4dl/ui";
import { Avatar, Badge, Button, Input, KeyRound, Label, Separator, Skeleton, Switch, Textarea } from "@4dl/ui";
import { PasskeysCard } from "@4dl/app-kit";
import { useCan } from "../permissions.js";
import { useFeature } from "../entitlements.js";
import { FeatureLockBadge } from "../components/feature-gate.js";
import { applyBrandTheme, deriveTokens, parseThemeCss, THEME_TOKENS } from "../brand-theme.js";
import { assetStoreUrl } from "../components/media-picker.js";
import {
  listAiModels,
  getAiDefaults,
  setAiDefaults,
  getBranding,
  setBranding,
  getPlayback,
  setPlayback,
  getMe,
  errText,
  type Me,
  uploadToLibrary,
  type AiModel,
  type AiDefaults,
  type WorkspaceBrand,
  type BrandLogo,
} from "../api.js";

const FONTS = [...FONT_FAMILIES, "system-ui"];

/** The generator tasks a tenant can pin a default model for. */
const AI_TASKS: { id: string; label: string; hint: string }[] = [
  { id: "text", label: "HTML slides & widgets", hint: "The model behind generated slides and widgets" },
  { id: "image", label: "Poster images", hint: "Image generation for poster slides" },
  { id: "tts", label: "Voice announcements", hint: "Text-to-speech for queue calls and ad voice" },
  { id: "music", label: "Music beds", hint: "Generated background music on the Music page" },
];

/* ============================= the page ================================== */

/**
 * Closing a section POPS the entry that opening it pushed.
 *
 * `setParams` alone pushes again, which looks equivalent — the URL ends up the
 * same — and is not: every open/close cycle leaves the history one deeper than
 * it started, so exploring four sections costs four Back presses to leave
 * Settings. Kova had exactly this bug and a client reported it almost word for
 * word.
 *
 * `idx > 0` is the guard for a DEEP LINK: somebody who landed straight on
 * `?s=brand` has nothing of ours to pop back to, and `history.back()` would
 * take them out of the app. There, replacing is right.
 */
function useCloseSection(): () => void {
  const [, setParams] = useSearchParams();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) window.history.back();
    else setParams((q: URLSearchParams) => { q.delete("s"); q.delete("sub"); return q; }, { replace: true });
  };
}

export function WorkspaceSettingsPage() {
  const canManage = useCan()("settings", "manage");
  const [params, setParams] = useSearchParams();
  const section = params.get("s");
  const sub = params.get("sub");
  const closeSection = useCloseSection();

  const open = (s: string | null, subKey: string | null = null) => {
    const next = new URLSearchParams(params);
    if (s) next.set("s", s);
    else next.delete("s");
    if (subKey) next.set("sub", subKey);
    else next.delete("sub");
    setParams(next);
  };

  /*
   * Everything the INDEX has to be able to say a current value for is loaded
   * here, once. Each row's sub-line is a fact about the workspace, and a fact
   * you cannot state is a row you have to open to read — which is the whole
   * thing the grammar exists to avoid.
   *
   * `null` means "not known yet" throughout, never "empty": a settings index
   * that renders "Screens free-run" for the length of a round trip has told
   * somebody their video wall is out of sync when it is not.
   */
  const [me, setMe] = useState<Me | null>(null);
  const [emailLoaded, setEmailLoaded] = useState(false);
  const email = me?.email ?? null;
  const [models, setModels] = useState<AiModel[] | null>(null);

  /*
    THE TWO INSTANT CONTROLS OWN THEIR STATE THROUGH `useConfirmedState`.

    Both were hand-rolled copies of it — snapshot, apply, write, restore on
    catch, toast — and both were the CORRECT shape, which is exactly why they
    are worth replacing: two copies of a subtle lifecycle drift apart, and the
    third one in this file (`saveLogos`, below) had already lost the rollback
    half entirely.

    The hook also fixes something the copies got wrong: it takes its snapshot
    INSIDE the state updater. Reading `freeRun` from the closure captures
    whatever was current when the callback was built, so flipping two controls
    in a row reverts to a stale value.

    `null` throughout means "not known yet", never "off" — an index that renders
    "Screens free-run" for the length of a round trip has told somebody their
    video wall is out of sync when it is not.
  */
  const playback = useConfirmedState<boolean | null>(null, errText);
  const aiDefaults = useConfirmedState<AiDefaults | null>(null, errText);
  const freeRun = playback.value;
  const defaults = aiDefaults.value;

  // Frame-accurate multi-screen sync is a premium capability; without the grant
  // the control is read-only and off.
  const canSync = useFeature("multiScreenSync");
  const syncOn = canSync && freeRun === false;

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setEmailLoaded(true));
    listAiModels()
      .then(setModels)
      .catch(() => setModels([]));
    // `reset` is the LOAD path: it replaces the value without a write and
    // without marking anything busy.
    getAiDefaults()
      .then((d) => aiDefaults.reset(d))
      .catch(() => aiDefaults.reset({}));
    getPlayback()
      .then((p) => playback.reset(p.freeRun))
      .catch(() => playback.reset(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  const brand = useBrandKit();

  usePageChrome({ crumbs: [{ label: "Settings" }], actions: [] }, []);

  async function toggleSync(v: boolean) {
    if (!canSync) return;
    await playback.commit("sync", !v, () => setPlayback(!v), "Couldn’t change playback — it is still set the way it was.");
  }

  async function pickDefault(task: string, modelId: string) {
    await aiDefaults.commit(
      task,
      (c) => ({ ...(c ?? {}), [task]: modelId }),
      () => setAiDefaults({ [task]: modelId }),
      "Couldn’t save that default — it is still set the way it was.",
    );
  }

  /* ── the index ─────────────────────────────────────────────────────────── */

  const aiSetCount = defaults ? AI_TASKS.filter((t) => defaults[t.id]).length : null;
  const tokenCount = brand.b ? Object.keys(brand.b.theme?.light ?? {}).length + Object.keys(brand.b.theme?.dark ?? {}).length : null;

  /**
   * A SUB-LINE THAT IS NOT KNOWN YET IS A SKELETON, not the word "Loading…".
   *
   * The four rows all read "Loading…" during the first round trip, which is a
   * loading state written as a VALUE: it occupies the one slot whose entire job
   * is to state a fact about the workspace, in the same type and colour a fact
   * would use, so the eye reads it as one. A shimmer in the shape of the answer
   * is both honest and quieter, and it is what every other surface in this
   * design system already does (§7).
   */
  const pending = <SkeletonLine w="9rem" h="xs" />;

  const rows: Record<string, SettingsEntry> = {
    brand: {
      key: "brand",
      icon: Palette,
      tone: "primary",
      label: "Brand kit",
      sub:
        brand.b === null
          ? pending
          : [
              brand.b.brandName || "No brand name",
              `${tokenCount} custom token${tokenCount === 1 ? "" : "s"}`,
              `${(brand.b.logos ?? []).length} logo${(brand.b.logos ?? []).length === 1 ? "" : "s"}`,
            ].join(" · "),
      onClick: () => open("brand"),
    },
    playback: {
      key: "playback",
      icon: MonitorPlay,
      tone: "fleet",
      label: "Playback",
      sub: !canSync ? "Screens free-run · not in your plan" : freeRun === null ? pending : syncOn ? "Multi-screen sync on" : "Screens free-run",
      onClick: () => open("playback"),
    },
    ai: {
      key: "ai",
      icon: Sparkles,
      tone: "channel",
      label: "Default AI models",
      sub: aiSetCount === null ? pending : `${aiSetCount} of ${AI_TASKS.length} generators pinned`,
      onClick: () => open("ai"),
    },
    signin: {
      key: "signin",
      icon: Mail,
      tone: "boards",
      label: "Sign-in",
      sub: !emailLoaded ? pending : (email ?? "Couldn’t load your account"),
      onClick: () => open("signin"),
    },
    /*
      PASSKEYS, which this app did not offer anywhere.

      `@4dl/app-kit` has shipped the whole ceremony — enroll, list, remove, the
      conditional-UI probe — and `PasskeysCard` since Tessa needed it. Scena's
      users were on emailed codes only, on a platform whose own documentation
      says "100% passwordless: email OTP + passkeys". The Sign-in section above
      even described passkeys as available, in prose, with nothing to press.
    */
    security: {
      key: "security",
      icon: KeyRound,
      tone: "insights",
      label: "Passkeys",
      sub: "How you sign in on this device",
      onClick: () => open("security"),
    },
  };

  if (!section) {
    return (
      /*
        No `mx-auto max-w-3xl` — `<main>` is the column now (App.tsx), and it
        pads itself. The hand-rolled one was 768 inside a 720 cap, so the outer
        always won and this only ever looked like it was doing something.
      */
      <div className="flex flex-col gap-5">
        <PageHeader title="Settings" description="Brand kit, playback, AI, and how you sign in" />
        {/*
          WHO, first — the fact a settings screen opens with, and the one thing
          on it that does not navigate, so it does not pretend to. Kova and
          Tessa both lead with it; Scena stated the address as a sub-line three
          rows down instead, which answers a different question.
        */}
        <Card className="flex items-center gap-3.5">
          <Avatar name={me?.user?.name || me?.email || "?"} src={me?.user?.image ?? undefined} className="size-12" />
          <div className="min-w-0 flex-1">
            {emailLoaded ? (
              <>
                <div className="truncate font-semibold">{me?.user?.name || me?.email || "Signed in"}</div>
                {me?.user?.name && me?.email && <div className="truncate text-body text-muted-foreground">{me.email}</div>}
              </>
            ) : (
              // `null` until known, like every row below — a name is not a
              // thing to guess at for the length of a round trip.
              <div className="space-y-1.5"><SkeletonLine w="10rem" h="text" /><SkeletonLine w="6rem" h="xs" /></div>
            )}
          </div>
          {me?.role && <Badge tone="primary">{me.role}</Badge>}
        </Card>
        <SettingsIndex
          groups={[
            { header: "Workspace", rows: [rows.brand!, rows.playback!, rows.ai!] },
            { header: "You", rows: [rows.signin!, rows.security!] },
          ]}
        />
      </div>
    );
  }

  /*
    POPS, rather than pushing a third entry. `open(null)` looked equivalent and
    left the history one deeper per open/close cycle — see `useCloseSection`.
  */
  const back = closeSection;

  return (
    // The column is `<main>`'s (App.tsx), which pads itself too. `Stagger` so a
    // section's cards rise in rather than appearing (§8): the index has had
    // choreography since `SettingsIndex` shipped and the pages had none, so
    // stepping into one was the only unanimated transition in the app.
    <Stagger className="flex flex-col gap-5">
      {/*
        ONE HEADER PER LEVEL, AND ONLY THE LEVEL YOU ARE ON DRAWS ONE.

        The brand kit is two deep — a section, then a sub-page — and wrapping
        both in a frame put TWO identical circular back buttons ninety pixels
        apart ("Brand kit ‹" over "Name, fonts & shape ‹"), with the parent's
        one-line intro repeated above a child that has nothing to do with it.
        That is the stacked-back pair Kova removed from its own settings, plus
        the four-levels-of-intro problem `SettingsPage` was written against.

        So the frame belongs to the brand INDEX. Once a sub-page is open,
        `SectionDetail` draws its own header and its back goes one step up — to
        that index, which is where the way out to Settings lives. Two backs, one
        at a time, each going somewhere different.
      */}
      {section === "brand" && (
        sub ? (
          <BrandKitSections brand={brand} canManage={canManage} openKey={sub} onOpen={(k) => open("brand", k)} />
        ) : (
          <SectionFrame
            title="Brand kit"
            description="Your shadcn theme tokens recolour the whole workspace, the on-screen widgets, and everything the AI generates."
            onBack={back}
          >
            <BrandKitSections brand={brand} canManage={canManage} openKey={sub} onOpen={(k) => open("brand", k)} />
          </SectionFrame>
        )
      )}

      {section === "playback" && (
        <SectionFrame title="Playback" onBack={back}>
          <Card>
            <div className="mb-4">
              <h3 className="text-title-3 flex items-center gap-2">
                <MonitorPlay className="size-4 text-muted-foreground" />
                Multi-screen sync
                <FeatureLockBadge feature="multiScreenSync" className="ml-1" />
              </h3>
              <p className="text-caption text-muted-foreground">
                When two or more screens play the same channel, sync keeps them frame-aligned so a video wall reads as one picture. A single screen always
                free-runs on its own — this only affects channels shared by several screens.
              </p>
            </div>
            <label className={`flex items-center justify-between gap-4 rounded-lg border px-3.5 py-3 ${canSync ? "cursor-pointer" : "opacity-60"}`}>
              <div className="min-w-0">
                <div className="text-body font-medium">Keep screens in sync</div>
                <div className="text-caption text-muted-foreground">
                  {canSync
                    ? "Frame-align screens sharing a channel. Republish channels to apply."
                    : "Your plan doesn’t include multi-screen sync — screens free-run. Upgrade to enable."}
                </div>
              </div>
              <Switch checked={syncOn} onCheckedChange={toggleSync} disabled={!canSync || freeRun === null} />
            </label>
          </Card>
        </SectionFrame>
      )}

      {section === "ai" && (
        <SectionFrame
          title="Default AI models"
          description="Which model each generator opens on. You can still override per generation; availability and pricing are the operator's."
          onBack={back}
        >
          <Card>
            {AI_TASKS.map((t, i) => {
              const opts = (models ?? []).filter((m) => m.task === t.id);
              return (
                <div key={t.id}>
                  {i > 0 ? <Separator className="my-1" /> : null}
                  <div className="flex items-center gap-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-caption font-medium">{t.label}</div>
                      <div className="text-caption text-muted-foreground">{t.hint}</div>
                    </div>
                    {models === null ? (
                      <Skeleton className="h-9 w-72" />
                    ) : opts.length === 0 ? (
                      <span className="w-72 text-right text-caption text-muted-foreground">No models enabled for this task.</span>
                    ) : (
                      <Select
                        value={defaults?.[t.id] ?? ""}
                        onChange={(v) => pickDefault(t.id, v)}
                        className="w-72"
                        placeholder="Choose a model"
                        options={[...opts.map((m) => ({ value: m.id, label: m.label }))]}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </SectionFrame>
      )}

      {section === "signin" && (
        <SectionFrame title="Sign-in" onBack={back}>
          <Card>
            {/*
                This was a form for claiming a global USERNAME so a person could
                sign in with a handle and a password. Both are gone: everyone
                who is a person signs in with an emailed code or a passkey, and
                the only handle left belongs to a STATION, which is provisioned
                on the Live Boards screen and never edits its own.
              */}
            {!emailLoaded ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <p className="text-body text-muted-foreground">
                {email ? (
                  <>
                    You sign in with a one-time code emailed to <span className="font-medium text-foreground">{email}</span>, or with a passkey. There is no
                    password to manage.
                  </>
                ) : (
                  <>We couldn’t load your account just now. Reload the page to try again.</>
                )}
              </p>
            )}
          </Card>
        </SectionFrame>
      )}

      {section === "security" && (
        <SectionFrame
          title="Passkeys"
          description="A passkey signs you in with your face, fingerprint or screen lock — no code to wait for. Emailed codes always keep working."
          onBack={back}
        >
          <PasskeysCard />
        </SectionFrame>
      )}
    </Stagger>
  );
}

/* ============================ the brand kit ============================== */

const NEUTRAL_TINTS = [
  { id: "brand", label: "Brand-tinted" },
  { id: "gray", label: "Neutral gray" },
  { id: "cool", label: "Cool" },
  { id: "warm", label: "Warm" },
];

/** Quick-start brand colours for the palette generator. */
const PRESET_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444"];

/**
 * The brand kit's state, lifted out of the section that edits it.
 *
 * It has to live above the index, because the index states the current value —
 * the brand name, the token count, how many logos — and a summary that fetched
 * separately from the editor is two sources for one answer.
 */
function useBrandKit() {
  const [b, setB] = useState<WorkspaceBrand | null>(null);
  /*
   * The last SAVED kit, re-applied when the settings screen unmounts, so an
   * abandoned preview does not follow you around the app. It is scoped to the
   * whole screen rather than to the brand section on purpose: stepping back to
   * the index and in again is a normal thing to do mid-edit, and restoring
   * there would silently discard the work.
   */
  const savedRef = useRef<WorkspaceBrand | null>(null);

  useEffect(() => {
    getBranding()
      .then((v) => {
        setB(v);
        savedRef.current = v;
      })
      .catch(() => {});
    return () => {
      if (savedRef.current) applyBrandTheme(savedRef.current);
    };
  }, []);

  /** Merge a patch, re-render, and apply the theme live across the whole UI. */
  const update = (p: Partial<WorkspaceBrand>) =>
    setB((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...p };
      applyBrandTheme(next);
      return next;
    });

  /** Set one token (blank clears it → falls back to the shipped default). */
  const setToken = (mode: "light" | "dark", token: string, value: string) =>
    setB((cur) => {
      if (!cur) return cur;
      const side = { ...(cur.theme?.[mode] ?? {}) };
      if (value.trim()) side[token] = value.trim();
      else delete side[token];
      const next = { ...cur, theme: { ...cur.theme, [mode]: side } };
      applyBrandTheme(next);
      return next;
    });

  /*
    THE SAVE GOES THROUGH `useAction`, and the outcome is rendered next to the
    button rather than thrown at a corner of the screen.

    `setSaving(true) / try / toast / finally` is the shape `save-lifecycle`
    exists to replace. It is not wrong here — it does catch — but it reports
    into a toast, which on a form is the wrong PLACE: the toast has gone by the
    time the eye returns to the button, and the button itself never says whether
    the last press landed. `SaveBar` puts the outcome directly above the control
    that produced it, and disables while saving AND while nothing has changed,
    so "did that save?" is answered by the control instead of by pressing again.
  */
  const act = useAction(errText);

  async function save() {
    if (!b) return;
    await act.run(
      "brand",
      async () => {
        const fresh = await setBranding(b);
        setB(fresh);
        savedRef.current = fresh;
        applyBrandTheme(fresh);
        return "Brand saved — the whole workspace now follows it.";
      },
      "Couldn’t save the brand — nothing was changed.",
    );
  }

  /*
    ⚠️ THIS ONE WAS A LYING OPTIMISTIC WRITE, and it is the reason the two
    switches above moved to `useConfirmedState`.

    It applied `next` to the state AND to `savedRef` — the snapshot the screen
    restores on unmount — and then, on a refused save, only toasted. So a
    rejected rename left the new label on screen, recorded as the last SAVED
    kit, and re-applied on the way out. The one write in this file with no
    rollback was also the one that corrupted the rollback target.

    `savedRef` now moves only after the server has agreed, and the state snaps
    back when it has not.
  */
  async function saveLogos(logos: BrandLogo[]) {
    if (!b) return;
    const before = b;
    const next = { ...b, logos };
    setB(next);
    try {
      await setBranding({ logos });
      savedRef.current = next;
    } catch (e) {
      setB(before);
      toast.error(errText(e, "Couldn’t save the logos — they are still as they were."));
    }
  }

  return { b, setB, save, update, setToken, saveLogos, savedRef, act };
}

type BrandKit = ReturnType<typeof useBrandKit>;

function BrandKitSections({
  brand,
  canManage,
  openKey,
  onOpen,
}: {
  brand: BrandKit;
  canManage: boolean;
  openKey: string | null;
  onOpen: (key: string | null) => void;
}) {
  const { b } = brand;
  if (!b)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );

  const tokenCount = Object.keys(b.theme?.light ?? {}).length + Object.keys(b.theme?.dark ?? {}).length;
  const logoCount = (b.logos ?? []).length;

  /*
   * Four sub-pages, and each one saves on its own terms — which is why there is
   * no shared `footer` here. Identity is a form with a Save; the palette
   * generator writes into that same unsaved form (and says so); assets upload
   * immediately because an upload has already happened by the time you see it;
   * tokens are part of identity's form. `SectionDetail`'s footer is for
   * sub-pages that must submit together, and these must not.
   */
  const subs: (SettingsEntry & { render: () => ReactNode })[] = [
    {
      key: "identity",
      icon: Type,
      label: "Name, fonts & shape",
      sub: `${b.brandName || "No brand name"} · ${b.headingFont} · ${b.radius}px corners`,
      render: () => <BrandIdentity brand={brand} canManage={canManage} />,
    },
    {
      key: "palette",
      icon: Wand2,
      label: "Palette",
      sub: tokenCount ? `${tokenCount} token${tokenCount === 1 ? "" : "s"} overridden` : "Shipped defaults",
      disabled: !canManage,
      render: () => <BrandPalette brand={brand} />,
    },
    {
      key: "assets",
      icon: ImagePlus,
      label: "Brand assets",
      sub: logoCount ? `${logoCount} logo${logoCount === 1 ? "" : "s"}` : "No logos yet",
      disabled: !canManage,
      render: () => <BrandAssets brand={brand} />,
    },
    {
      key: "tokens",
      icon: Sliders,
      label: "shadcn tokens",
      sub: `${THEME_TOKENS.length} tokens · ${tokenCount} overridden`,
      disabled: !canManage,
      render: () => <BrandTokens brand={brand} />,
    },
  ];

  return <SectionDetail subs={subs} openKey={openKey} onOpen={onOpen} />;
}

function BrandIdentity({ brand, canManage }: { brand: BrandKit; canManage: boolean }) {
  const { b, update, save, act } = brand;
  if (!b) return null;
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-caption text-muted-foreground">Brand name</Label>
          <Input
            value={b.brandName}
            disabled={!canManage}
            onChange={(e) => update({ brandName: e.target.value })}
            placeholder="e.g. Acme Clinic"
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-caption text-muted-foreground">Corner radius · {b.radius}px</Label>
          <input
            type="range"
            min={0}
            max={32}
            value={b.radius}
            disabled={!canManage}
            onChange={(e) => update({ radius: +e.target.value })}
            className="mt-2 w-full accent-primary"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-caption text-muted-foreground">Heading font</Label>
          <Select
            value={b.headingFont}
            onChange={(v) => update({ headingFont: v })}
            disabled={!canManage}
            className="w-full"
            options={[...FONTS.map((f) => ({ value: f, label: f }))]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-caption text-muted-foreground">Body font · drives all UI text</Label>
          <Select
            value={b.bodyFont}
            onChange={(v) => update({ bodyFont: v })}
            disabled={!canManage}
            className="w-full"
            options={[...FONTS.map((f) => ({ value: f, label: f }))]}
          />
        </div>
      </div>

      <UiSampler brandName={b.brandName} />

      {canManage && (
        <SaveBar label="Save brand" saving={act.busy === "brand"} msg={act.msg} err={act.err} onSave={() => void save()} />
      )}
    </Card>
  );
}

function BrandPalette({ brand }: { brand: BrandKit }) {
  const { b, update, save, act } = brand;
  // A starting colour is not a stored field — the generated TOKENS are what get
  // saved. These only seed them.
  const [genColor, setGenColor] = useState("#6366f1");
  const [genAccent, setGenAccent] = useState("#f59e0b");
  const [genNeutral, setGenNeutral] = useState("brand");
  const [pasted, setPasted] = useState("");
  if (!b) return null;

  const tokenCount = Object.keys(b.theme?.light ?? {}).length + Object.keys(b.theme?.dark ?? {}).length;

  function generate() {
    update({ theme: deriveTokens({ primary: genColor, secondary: genAccent, neutral: genNeutral }) });
    toast.success("Palette generated — it is previewing live. Save to keep it.");
  }

  function applyPastedTheme() {
    if (!b) return;
    const parsed = parseThemeCss(pasted);
    const n = Object.keys(parsed.light).length + Object.keys(parsed.dark).length;
    if (!n) {
      toast.error("No shadcn tokens found — paste a :root { … } / .dark { … } theme.");
      return;
    }
    update({ theme: { light: { ...b.theme.light, ...parsed.light }, dark: { ...b.theme.dark, ...parsed.dark } } });
    setPasted("");
    toast.success(`Imported ${n} token${n === 1 ? "" : "s"}. Save to keep.`);
  }

  return (
    <Card>
      <div className="mb-4">
        <p className="text-caption text-muted-foreground">
          Generate a coherent shadcn palette from a brand colour, or paste one you already have. Either way it previews across the whole workspace immediately
          and is <b>not saved until you press Save</b> — leaving Settings puts the last saved kit back.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setGenColor(c)}
            title={c}
            aria-label={`Use ${c}`}
            className={`size-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition ${genColor.toLowerCase() === c ? "ring-foreground" : "ring-transparent hover:ring-border"}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ColorField label="Brand colour" value={genColor} onChange={setGenColor} />
        <ColorField label="Accent" value={genAccent} onChange={setGenAccent} />
        <div className="flex flex-col gap-1.5">
          <Label className="text-caption text-muted-foreground">Neutral tint</Label>
          <Select value={genNeutral} onChange={setGenNeutral} className="w-full" options={[...NEUTRAL_TINTS.map((n) => ({ value: n.id, label: n.label }))]} />
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={generate}>
            <Wand2 className="size-4" /> Generate
          </Button>
        </div>
      </div>

      <Separator />
      <div className="flex flex-col gap-1.5">
        <Label className="text-caption text-muted-foreground">Paste a shadcn theme</Label>
        <Textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={":root { --primary: oklch(…); … }\n.dark { … }"}
          className="h-24 font-mono text-caption"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!pasted.trim()} onClick={applyPastedTheme}>
            Import tokens
          </Button>
          {tokenCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                update({ theme: { light: {}, dark: {} } });
                toast.success("Theme reset to the shipped defaults.");
              }}
            >
              <RotateCcw className="size-3.5" /> Reset to defaults
            </Button>
          )}
          {/* The generator used to leave the only Save button one card away,
                which is how a generated palette got previewed and abandoned. */}
          <Button size="sm" className="ml-auto" onClick={() => void save()} disabled={act.busy === "brand"}>
            {act.busy === "brand" ? "Saving…" : "Save brand"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BrandAssets({ brand }: { brand: BrandKit }) {
  const { b, setB, saveLogos, savedRef } = brand;
  const [uploading, setUploading] = useState(false);
  if (!b) return null;

  async function addLogo(file: File) {
    if (!b) return;
    setUploading(true);
    try {
      const { url } = await uploadToLibrary(file);
      const label = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Logo";
      // An ABSOLUTE url, because the logo also renders on the player, which is
      // a separate origin.
      const logo: BrandLogo = { id: `logo_${Math.random().toString(36).slice(2, 10)}`, label, url: assetStoreUrl(url), mime: file.type };
      const next = { ...b, logos: [...(b.logos ?? []), logo] };
      setB(next);
      await setBranding({ logos: next.logos });
      savedRef.current = next;
      toast.success("Logo added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <div className="mb-4">
        <p className="text-caption text-muted-foreground">
          Your logo and any variants (dark, light, mark, wordmark…). They are saved to the media library and available to the <b>Company logo</b> widget and the
          AI generators. Unlike the palette, these save as soon as you add or remove one.
        </p>
      </div>
      {(b.logos ?? []).length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {b.logos.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-lg border p-2">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#0000_0deg_90deg,#8884_90deg_180deg)] bg-[length:14px_14px]">
                <img src={l.url} alt={l.label} className="max-h-12 max-w-12 object-contain" />
              </span>
              <Input
                value={l.label}
                onChange={(e) => setB({ ...b, logos: (b.logos ?? []).map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)) })}
                onBlur={() => saveLogos(b.logos)}
                className="h-8 flex-1 text-body"
                maxLength={40}
                placeholder="Variant name"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${l.label}`}
                onClick={() => void saveLogos((b.logos ?? []).filter((x) => x.id !== l.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-body text-muted-foreground transition-colors hover:bg-accent">
        {uploading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            <ImagePlus className="size-4" /> Upload a logo
          </>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addLogo(f);
            e.target.value = "";
          }}
        />
      </label>
    </Card>
  );
}

function BrandTokens({ brand }: { brand: BrandKit }) {
  const { b, setToken, save, act } = brand;
  if (!b) return null;
  return (
    <Card>
      <div className="mb-4">
        <p className="text-caption text-muted-foreground">
          The single source of truth. Set any token; blank fields fall back to the shipped default. Accepts any CSS colour (hex, <code>oklch()</code>,{" "}
          <code>hsl()</code>).
        </p>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5 text-caption">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground">Token</span>
        <span className="w-32 text-center font-semibold uppercase tracking-wider text-muted-foreground">Light</span>
        <span className="w-32 text-center font-semibold uppercase tracking-wider text-muted-foreground">Dark</span>
        {THEME_TOKENS.map((t) => (
          <TokenRow
            key={t}
            token={t}
            light={b.theme?.light?.[t] ?? ""}
            dark={b.theme?.dark?.[t] ?? ""}
            lightDefault={DEFAULT_TOKENS.light[t] ?? ""}
            darkDefault={DEFAULT_TOKENS.dark[t] ?? ""}
            onChange={setToken}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={act.busy === "brand"}>
          {act.busy === "brand" ? "Saving…" : "Save brand"}
        </Button>
      </div>
    </Card>
  );
}

/** A hex colour swatch + text field (shared by the palette generator inputs). */
function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-caption text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 rounded-lg border p-1.5">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label={label}
        />
        <input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent font-mono text-caption uppercase outline-none"
          maxLength={7}
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}

/** One token row: label + light/dark inputs with swatches (placeholder = default). */
function TokenRow({
  token,
  light,
  dark,
  lightDefault,
  darkDefault,
  onChange,
}: {
  token: string;
  light: string;
  dark: string;
  lightDefault: string;
  darkDefault: string;
  onChange: (mode: "light" | "dark", token: string, value: string) => void;
}) {
  const cell = (mode: "light" | "dark", value: string, defaultVal: string) => (
    <div className="flex w-32 items-center gap-1.5 rounded-md border px-1.5 py-1">
      <span className="size-4 shrink-0 rounded-sm border" style={{ background: value || defaultVal }} />
      <input
        value={value}
        onChange={(e) => onChange(mode, token, e.target.value)}
        placeholder={defaultVal.replace(/oklch\(|\)/g, "")}
        aria-label={`--${token} ${mode}`}
        className="w-full bg-transparent font-mono text-caption outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
  return (
    <>
      <code className="truncate text-caption text-muted-foreground">--{token}</code>
      {cell("light", light, lightDefault)}
      {cell("dark", dark, darkDefault)}
    </>
  );
}

/** A compact swatch of the live theme tokens, so status colours are visible too. */
function UiSampler({ brandName }: { brandName: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 text-micro text-muted-foreground uppercase">{brandName || "Your workspace"} · live preview</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">Primary</Button>
        <Button size="sm" variant="secondary">
          Secondary
        </Button>
        <Button size="sm" variant="outline">
          Outline
        </Button>
        <Badge>Default</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="primary">Info</Badge>
        <Badge tone="danger">Error</Badge>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {/* The tokens that EXIST. `info` was in this list and is defined
            nowhere, so the swatch rendered a transparent box captioned with a
            colour name — a colour chart lying about the palette. The platform's
            status tones are success / warning / danger, and informational
            reads as the brand accent. */}
        {(["primary", "accent", "secondary", "muted", "success", "warning", "destructive"] as const).map((t) => (
          <div key={t} className="flex flex-col items-center gap-1">
            <div className="h-8 w-full rounded-md border" style={{ background: `var(--${t})` }} />
            <span className="text-caption text-muted-foreground">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
