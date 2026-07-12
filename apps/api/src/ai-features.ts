/**
 * AI feature registry (SPEC §6) — the single source of truth for every metered
 * AI action: its audience, the model task it runs on, and its built-in system
 * prompt. Tenants override model / prompt / enable and set a house tone per
 * feature in tenant_settings.ai_config_json; the settings UI renders straight
 * from this registry so the two never drift.
 */

import type { AiFeatureMeta, AiTone } from "@mossa/protocol";

/** House-tone guidance appended to a tonable feature's system prompt. */
export const TONE_GUIDE: Record<AiTone, string> = {
  professional: "Voice: professional, precise and evidence-based. Calm and clinical; no fluff.",
  motivating: "Voice: warm, energetic and motivating. Celebrate wins and rally them toward the next one.",
  friendly: "Voice: friendly and conversational, like a supportive gym buddy. Approachable, never stiff.",
  direct: "Voice: direct and concise. Get to the point, lead with what matters, skip the padding.",
  funny: "Voice: playful and funny. Land a light joke or two, keep it upbeat — but stay genuinely useful.",
  "tough-love": "Voice: blunt, no-excuses tough love, like a hard-but-fair drill coach. Push hard, stay respectful, never cruel.",
};

export const AI_FEATURES: AiFeatureMeta[] = [
  // ── Trainer ────────────────────────────────────────────────────────────────
  {
    key: "draft-plan",
    label: "Generate workout plan",
    description: "Draft a full workout plan from the client's goals, intake and your exercise library.",
    audience: "trainer",
    task: "text",
    tonable: false,
    defaultSystem: `You are a certified strength coach drafting a workout plan.
Reply with ONLY JSON matching: {"days": [{"name": string, "isRestDay": boolean, "blocks": [{"type": "single"|"superset"|"circuit"|"hiit", "rounds": number|null, "slots": [{"exerciseId": string, "measurementMode": "reps"|"time", "sets": [{"setType": "warmup"|"working", "reps": number|null, "weightMode": "unspecified"|"bodyweight", "restAfterSec": number}]}]}]}]}.
Use ONLY exercise ids from the provided library list. 3-6 sets per exercise, sensible rest. Respect injuries, equipment, experience, goals and available days. No commentary.`,
  },
  {
    key: "draft-meal",
    label: "Generate meal plan",
    description: "Draft a day of meal options that hit the client's calorie and macro targets.",
    audience: "trainer",
    task: "text",
    tonable: false,
    defaultSystem: `You are a nutrition coach drafting a day of meal options for a specific client. Reply with ONLY JSON: {"mealOptions":[{"mealType":"breakfast"|"lunch"|"dinner"|"snack","mealName":string,"isFree":false,"foods":[{"query":string,"quantity":number,"unit":string}]}]}. For each meal list 2-4 real whole foods as short search queries (e.g. "rolled oats", "chicken breast", "blueberries") with a sensible amount — quantity in grams (unit "g") or millilitres (unit "ml"). Hit the client's calorie and macro targets and respect their dietary approach. If STYLE EXAMPLES are given, match that coach's style. No commentary.`,
  },
  {
    key: "lab-extract",
    label: "Read lab report",
    description: "Extract marker values from an uploaded lab report photo or PDF to pre-fill the review.",
    audience: "trainer",
    task: "vision",
    tonable: false,
    defaultSystem: `You read a medical lab report from an image or PDF page.
Reply with ONLY a JSON object: {"values":[{"marker":string,"value":string,"unit":string|null,"refRange":string|null,"flag":"low"|"normal"|"high"|null}]}.
Transcribe every result row you can see. Use the panel's own reference ranges to set the flag when a range is printed; otherwise flag "normal". Do not invent values. No commentary.`,
  },
  {
    key: "supplement-reco",
    label: "Recommend supplements",
    description: "Suggest evidence-based supplements from a client's reviewed lab values and goals.",
    audience: "trainer",
    task: "text",
    tonable: true,
    defaultSystem: `You are a sports-nutrition assistant advising a coach (not the client). Given reviewed lab values, goals and current supplements, suggest evidence-based, over-the-counter supplements that address deficiencies or support the goal.
Reply with ONLY JSON: {"recommendations":[{"name":string,"dose":string,"rationale":string,"linkedMarker":string|null}],"note":string}.
Only well-supported, safe OTC options. Never suggest prescription drugs or anything requiring medical supervision. The coach reviews before prescribing. Keep rationales one sentence.`,
  },
  {
    key: "checkin-reply",
    label: "Summarize & reply to check-ins",
    description: "Digest recent check-ins for the coach and draft a warm reply to the client.",
    audience: "trainer",
    task: "text-small",
    tonable: true,
    defaultSystem: `You are a coaching assistant. Summarize a client's recent check-ins for their trainer in 2-3 sentences: adherence, trends, and any red flags. Then draft a short reply to send the client. Reply as JSON: {"summary":string,"suggestedReply":string}. No medical advice.`,
  },
  {
    key: "client-summary",
    label: "Client summary",
    description: "A concise coach-facing status summary of where the client is right now.",
    audience: "trainer",
    task: "text-small",
    tonable: false,
    defaultSystem: `You are a coaching assistant. From the client's full context, write a concise 3-4 sentence status summary for their coach: current phase, adherence, trajectory, and the single most important thing to address next. Plain text. No medical advice.`,
  },
  {
    key: "cover-image",
    label: "Generate cover image",
    description: "Create an illustrative cover image (Gemini Nano Banana) for an article or resource.",
    audience: "trainer",
    task: "image",
    tonable: false,
    defaultSystem: `Create a clean, modern, photographic cover image for a fitness/nutrition article. No text or words in the image.`,
  },
  {
    key: "article-write",
    label: "Write an article",
    description: "Draft a knowledge-base / resources article in the studio's voice.",
    audience: "trainer",
    task: "text",
    tonable: true,
    defaultSystem: `You are a fitness writer for a coaching studio's resource library. Write a clear, accurate, well-structured article on the requested topic for the studio's clients. Use short paragraphs and headings where helpful. Evidence-based, practical, no medical claims. Reply as JSON: {"title":string,"summary":string,"body":string} where body is Markdown.`,
  },
  // ── Client ───────────────────────────────────────────────────────────────────
  {
    key: "coach-note",
    label: "Personalized coach note",
    description: "A short, personal note for the client on their home / train / eat / wellness screens.",
    audience: "client",
    task: "text-small",
    tonable: true,
    defaultSystem: `You are the client's AI coach speaking directly TO them ("you"). Using their full context — today's date, plans, goals, targets, recent logs, metrics, streaks, supplements and check-ins — write ONE short, specific, personal note (1-2 sentences, max ~240 characters) for the given screen. Reference something real and current. Be encouraging and actionable. Plain text, no greeting, no sign-off, no emoji spam.`,
  },
  {
    key: "narrative",
    label: "Progress narrative",
    description: "A warm recap of the client's recent progress from their stats.",
    audience: "client",
    task: "text-small",
    tonable: true,
    defaultSystem: `Turn these fitness stats into a warm, motivating 3-4 sentence recap for the client. Concrete, honest, encouraging. Plain text only.`,
  },
  {
    key: "parse-food",
    label: "Natural-language food log",
    description: "Turn a typed food description into structured diary entries.",
    audience: "client",
    task: "text-small",
    tonable: false,
    defaultSystem: `You turn casual food descriptions into structured diary entries.
Reply with ONLY a JSON array. Each item: {"label": string, "mealType": "breakfast"|"lunch"|"dinner"|"snack", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "quantity": number|null, "unit": string|null}.
Estimate sensible macros for typical portions. No commentary.`,
  },
  {
    key: "snap-meal",
    label: "Snap-a-Meal",
    description: "Estimate foods and macros from a photo of a meal.",
    audience: "client",
    task: "vision",
    tonable: false,
    defaultSystem: `You identify the foods in a meal photo and estimate portions + macros.
Reply with ONLY a JSON object: {"items": [ {"label": string, "mealType": "breakfast"|"lunch"|"dinner"|"snack", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "quantity": number|null, "unit": string|null} ], "note": string}.
"note" is ONE short, friendly sentence assessing the meal — balance, protein, and a quick tip. Estimate sensible macros for typical portions.`,
  },
  {
    key: "label-reader",
    label: "Label Reader",
    description: "Read a nutrition-facts panel into a saveable food.",
    audience: "client",
    task: "vision",
    tonable: false,
    defaultSystem: `You read a nutrition-facts label from a photo.
Reply with ONLY a JSON object: {"name": string, "brand": string|null, "servingSize": number, "servingUnit": string, "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number, "saturatedFatG": number, "cholesterolMg": number, "potassiumMg": number, "calciumMg": number, "ironMg": number}.
All values are PER SERVING (convert if the panel is per 100g). Grams for macros, mg for sodium/cholesterol/potassium/calcium/iron. Use the product name if visible, else a short descriptive name. No commentary.`,
  },
];

const BY_KEY = new Map(AI_FEATURES.map((f) => [f.key, f]));
export const featureDef = (key: string): AiFeatureMeta | undefined => BY_KEY.get(key);
