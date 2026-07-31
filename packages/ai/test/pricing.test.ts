import { describe, expect, it } from "vitest";
import { parseWorkersAiPricing, parseGeminiPricing, usdPerMToNeurons, usdToNeurons } from "../src/pricing.js";

// Real-format snippets from the Cloudflare Workers AI pricing markdown.
const CF_MD = `
| Model | Price in Tokens | Price in Neurons |
| ----- | --------------- | ---------------- |
| @cf/meta/llama-3.2-3b-instruct | $0.051 per M input tokens  $0.335 per M output tokens | 4625 neurons per M input tokens  30475 neurons per M output tokens |
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | $0.293 per M input tokens  $2.253 per M output tokens | 26668 neurons per M input tokens  204805 neurons per M output tokens |
| @cf/meta/llama-3.2-11b-vision-instruct | $0.049 per M input tokens  $0.676 per M output tokens | 4410 neurons per M input tokens  61493 neurons per M output tokens |
| @cf/baai/bge-small-en-v1.5 | $0.020 per M input tokens | 1841 neurons per M input tokens |
| @cf/black-forest-labs/flux-1-schnell | $0.0000528 per 512x512 tile | 4.80 neurons per 512x512 tile  9.60 neurons per step |
`;

// Real-format snippets from the Gemini pricing markdown.
const GEMINI_MD = `
## Gemini 3.1 Flash-Lite

*\`gemini-3.1-flash-lite\`*

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $0.25 (text / image / video) $0.50 (audio) |
| Output price (including thinking tokens) | Free of charge | $1.50 |

## Gemini 2.5 Pro

*\`gemini-2.5-pro\`*

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $2.50 |
| Output price (including thinking tokens) | Free of charge | $15.00 |

## Gemini 2.5 Flash Image (Nano Banana)

*\`gemini-2.5-flash-image\`*

|   | Free Tier | Paid Tier |
| Input price | Not available | $0.30 (text) |
| Output price | Not available | $0.039 per image* |

## Gemini 2.5 Flash TTS Preview

*\`gemini-2.5-flash-preview-tts\`*

|   | Free Tier | Paid Tier |
| Input price | Free of charge | $0.50 |
| Output price | Free of charge | $10.00 |
`;

describe("USD → neuron conversion (keeps every provider on one credit math)", () => {
  it("converts at Cloudflare's neuron price ($0.011 / 1000)", () => {
    expect(usdPerMToNeurons(2.5)).toBe(227273); // 2.5 / 0.000011
    expect(usdToNeurons(0.039)).toBe(3545); // 0.039 / 0.000011
  });
});

describe("parseWorkersAiPricing", () => {
  it("reads neuron rates, classifies task, skips embeddings + image rows", () => {
    const models = parseWorkersAiPricing(CF_MD);
    const byId = new Map(models.map((m) => [m.id, m]));
    expect(byId.get("@cf/meta/llama-3.2-3b-instruct")).toMatchObject({ provider: "workers-ai", task: "text-small", inputRate: 4625, outputRate: 30475 });
    expect(byId.get("@cf/meta/llama-3.3-70b-instruct-fp8-fast")).toMatchObject({ task: "text", inputRate: 26668, outputRate: 204805 });
    // A Workers AI id that says "vision" must NOT land in the vision lane.
    // `generate()` has no image path for Workers AI and refuses the call
    // ("model cannot read images"), so a vision-tagged row here becomes a
    // pickable Snap-a-Meal model that fails every time — and the sync's
    // cheapest-per-lane election could crown it. It is a fine text model.
    expect(byId.get("@cf/meta/llama-3.2-11b-vision-instruct")!.task).toBe("text");
    expect(models.some((m) => m.task === "vision")).toBe(false);
    // Embedding (input only) and image (tile-priced) rows are not text models.
    expect(byId.has("@cf/baai/bge-small-en-v1.5")).toBe(false);
    expect(byId.has("@cf/black-forest-labs/flux-1-schnell")).toBe(false);
  });
});

describe("parseGeminiPricing", () => {
  it("converts token USD→neurons, captures Nano Banana per-image, skips TTS", () => {
    const models = parseGeminiPricing(GEMINI_MD);
    const byId = new Map(models.map((m) => [m.id, m]));
    expect(byId.get("gemini-2.5-pro")).toMatchObject({ provider: "google", task: "text", inputRate: usdPerMToNeurons(2.5), outputRate: usdPerMToNeurons(15) });
    expect(byId.get("gemini-3.1-flash-lite")!.task).toBe("text-small");
    expect(byId.get("gemini-3.1-flash-lite")!.inputRate).toBe(usdPerMToNeurons(0.25)); // first $ in the input column
    const nano = byId.get("gemini-2.5-flash-image")!;
    expect(nano).toMatchObject({ task: "image", unitKind: "image", unitRate: usdToNeurons(0.039) });
    expect(byId.has("gemini-2.5-flash-preview-tts")).toBe(false); // TTS skipped
  });
});
