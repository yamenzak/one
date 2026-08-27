/**
 * AN APP, AND THE COMPOSITION THAT REFUSES A BROKEN ONE.
 *
 * ⚠️ EVERY CHECK IN HERE CATCHES SOMETHING THAT WOULD OTHERWISE FAIL SILENTLY.
 * That is the standard for being here at all: a mistake the compiler sees does
 * not need a refusal, and a mistake that throws at the first request does not
 * either. What belongs here is the class that boots fine, serves fine, and is
 * wrong — a permission no role can hold, an entitlement nothing enforces, a
 * quota nothing counts, a notification nobody can receive.
 *
 * ⚠️ AND THEY ARE REPORTED ALL AT ONCE. A check that stops at the first failure
 * turns fixing a manifest into a conversation of one sentence at a time.
 *
 * ⚠️ THE DECLARATIONS BELOW ARE THE WHOLE CROSS-CUTTING SURFACE (D12). An app
 * that needed to reach outside them to switch something on would be the proof
 * that the framework does not have the property it exists to have — so a new
 * concern becomes a field here, never a call site over there.
 *
 * Layer 3. Imports everything below it.
 */

import type { AccessSpec } from "./access.js";
import {
  PLATFORM_PERMISSIONS, PLATFORM_PERSONAL, PLATFORM_ROLES, claimsPlatform, foundingAppRole,
  roleIdOk,
  undeclared, unholdable,
} from "./access.js";
import type { Lane } from "./ai.js";
import type { WhitelabelDef } from "./brand.js";
import type { CollectionSpec } from "./collection.js";
import { danglingRefs, eventsFor, operationsFor, quotasWithoutCeiling, refuseCollection } from "./collection.js";
import type { MeterBook } from "./credit.js";
import { unbounded } from "./credit.js";
import { unknownInPrompt } from "./ai.js";
import type { EntitlementDef } from "./entitlement.js";
import { ALLOWANCE_KEY, PLATFORM_ENTITLEMENTS, unenforced } from "./entitlement.js";
import { holdingsIn, type Holding } from "./field.js";
import type { FlagBook } from "./flag.js";
import { refuseFlags, unreadFlags } from "./flag.js";
import type { GuideBook, HelpBook, MilestoneBook } from "./guide.js";
import { refuseGuide } from "./guide.js";
import type { JobBook } from "./job.js";
import { refuseJobs } from "./job.js";
import type { NeedBook } from "./infra.js";
import { mediaNeedFor, refuseNeeds } from "./infra.js";
import type { DeploymentLegal, DocumentBook, SubProcessorBook, SubProcessorDef } from "./legal.js";
import { PLATFORM_HOLDINGS, refuseLegal } from "./legal.js";
import type { NotificationBook } from "./notify.js";
import { deadLinks, unaddressable, unraisable } from "./notify.js";
import type { AnyOperation } from "./operation.js";
import { PUBLIC, isSilent, refuseOperation, unreachable, unrecordedWrites } from "./operation.js";
import type { ProblemCatalog } from "./problem.js";
import type { ReachDef } from "./reach.js";
import { refuseReach } from "./reach.js";
import { PLATFORM_PROBLEMS, redefined, unknownProblems } from "./problem.js";
import type { AreaBook, SettingBook } from "./setting.js";
import { refuseSettings } from "./setting.js";
import { LADDER, refuseLadder } from "./dunning.js";
import { SURFACES, refuseSurfaces } from "./brand.js";
import type { Fill, Match, SurfaceSpec, ViewSpec } from "./surface.js";
import {
  blocksIn, fillOf, fillsIn, goOf, refuseStory, refuseSurface, refuseView, unreadViews,
} from "./surface.js";
import { ASKS, BLOCKS, HEROES } from "./blocks.js";
import type { PurposeBook, VaultBook } from "./vault.js";
import { refuseVault, strayFacts } from "./vault.js";
import type { AppId, Tone } from "./primitives.js";

/* ------------------------------------------------------------------ shape --- */

export interface ScreenSpec {
  readonly id: string;
  readonly route: string;
  readonly label: string;
  /**
   * WHETHER THIS SCREEN IS IN THE NAVIGATION, AND THERE IS NO THIRD ANSWER.
   *
   * ⚠️ THERE WAS A `secondary` TIER AND IT WAS A MEGA MENU. Five destinations
   * at the thumb, and everything else behind an item that opened a sheet of
   * rows — so a product with twelve screens had twelve places to look and the
   * bar could not answer "where am I" from seven of them. The ceiling was never
   * the problem; the overflow was. A second tier is what an app reaches for
   * instead of deciding, and what it produces is a menu somebody has to read.
   *
   * ⚠️ SO A SCREEN IS A DESTINATION OR IT BELONGS TO A SUBJECT. `none` is not
   * "unreachable" — it is reached from the thing it is about: Receive from
   * Stock, Labels from a location, Suppliers from the catalogue. That is a
   * shorter path than a menu for the person who wanted it and no path at all
   * for everybody else, which is what the five slots are protecting.
   *
   * ⚠️ Only five may be `primary` — see `PRIMARY_MAX` and D10.
   */
  readonly nav?: "primary" | "none";
  /**
   * WHAT THIS SCREEN IS TO THE CHROME, WHERE IT IS MORE THAN A DESTINATION.
   *
   * ⚠️ TWO SCREENS IN EVERY PRODUCT ARE NOT PLACES YOU GO. Searching and asking
   * are things somebody does FROM wherever they are, about whatever is in front
   * of them — so a slot in the bar makes each of them a journey: go to the
   * search screen, then say what you wanted. Both were destinations, and both
   * were spending one of five.
   *
   * ⚠️ SO THE CHROME DRAWS THEM AND THE SCREEN STILL EXISTS. `search` becomes
   * the field in the crown's middle; `assistant` becomes the button beside the
   * notifications. Each keeps its own address, because both are somewhere you
   * can end up and have to be able to come back to.
   *
   * ⚠️ AND A CHROME SCREEN IS NEVER ALSO IN THE NAV. Drawn in both, it is one
   * destination advertised twice — and the bar's fifth slot is spent on the
   * thing the crown already offers from every screen in the product.
   */
  readonly chrome?: "search" | "assistant";
  readonly icon?: string;
  readonly permission: string;
  /** ⚠️ A screen only a business has. Same rule as an operation's — see there. */
  readonly commercial?: true;
  /**
   * WHAT THIS SCREEN IS FOR — and the plan has to include at least one of them.
   *
   * ⚠️ AN ENTITLEMENT, NOT A PERMISSION, AND THE TWO ANSWER DIFFERENT QUESTIONS.
   * A permission is what this person may do in a workspace that has the feature;
   * this is whether the workspace has it at all. Gating a whole regulated half of
   * a product on a role means an owner sees it wherever they are — including on
   * a tier that never bought it.
   *
   * ⚠️ ANY, NOT ALL, BECAUSE A SCREEN IS OFTEN ABOUT MORE THAN ONE THING. A page
   * carrying runs and work orders is worth opening on a plan that has only work
   * orders; requiring both would withhold a screen half of which was paid for.
   * A screen about exactly one capability names exactly one, and reads the same.
   *
   * ⚠️ AND HIDING A SCREEN IS NOT WITHHOLDING A CAPABILITY. The operations behind
   * it carry their own `entitlement`, and they are what actually refuses; this
   * only stops the product offering a door somebody cannot walk through. A key
   * named HERE and nowhere else still fails composition as sold and unenforced,
   * which is the correct answer — an API is a door too.
   */
  readonly features?: readonly string[];
  /** A screen behind one of our switches. */
  readonly flag?: string;
  /** The ambience. Derived from theme tokens, so branding reaches it (D7). */
  readonly sky?: string;
  readonly tone?: Tone;
  /**
   * THIS SCREEN IS A FLOW OF QUESTIONS RATHER THAN A PAGE — see `Story`.
   *
   * ⚠️ THE SHAPE IS DECLARED AND THE CONTROLS ARE NOT, WHICH IS THE WHOLE
   * DESIGN. A wizard's questions are FACTS about the product — what it asks, in
   * what order, to reach which write — and every one of them is worth knowing
   * outside the browser: the docs list them, an agent can be told what a flow
   * will want before it starts one, and an operator can see what a person is
   * taken through. The CONTROLS cannot be declared and should not be: a camera,
   * a barcode viewfinder and a packing editor are not fields, and a manifest
   * that could express them would be a second React.
   *
   * ⚠️ SO WHAT THIS BUYS IS AGREEMENT, NOT GENERATION. The screen still draws
   * itself; the guard proves it draws exactly what was declared, that `writes`
   * is a real operation, and that the screen's own `permission` is the one that
   * operation demands. Those last two were two hand-typed strings in two files
   * with nothing checking they matched — so a flow could take somebody through
   * ten questions and be refused by the write at the end.
   */
  readonly story?: StorySpec;
  /**
   * THIS SCREEN IS A PLACE SOMEBODY WORKS RATHER THAN A FLOW THEY WALK — see
   * `SessionSpec`.
   *
   * ⚠️ THE THIRD KIND, AND IT IS THE ONE THE PORT FOUND MISSING. A `body` is
   * READ and drawn by the engine; a `story` is NARRATED by the engine's flow
   * frame — one question to a screen, a dock, a review at the end. A session is
   * neither: it is one place with its own controls, where somebody works. The
   * shapes are real and different, and declaring one as the other claims
   * something a guard can check and will: receiving is a shelf that survives
   * between scans and twenty minutes of writes, which is not a walk that ends;
   * an import is a chooser, a mapping and a preview on one page, which is not a
   * flow of questions however much it looks like one in prose.
   *
   * ⚠️ SAME BARGAIN AS A STORY: the SHAPE is declared and the CONTROLS are not.
   * A camera, a viewfinder and a trigger are not fields, and a manifest that
   * could express them would be a second React. What this buys is agreement —
   * what the session writes, what it holds between writes, and how a thing gets
   * into it are facts about the product worth knowing outside the browser.
   */
  readonly session?: SessionSpec;
  /**
   * WHICH COLLECTION THIS SCREEN'S RECORD COMES FROM, WHERE IT IS ABOUT ONE.
   *
   * ⚠️ A `detail` SCREEN HAS A SUBJECT AND A `list` SCREEN DOES NOT, and until
   * the body could bind a field nothing needed to say which. It does now: every
   * `field` source resolves against this, so a screen that binds one and names
   * no `of` is refused rather than rendering blank lines where its facts were.
   */
  readonly of?: string;
  /**
   * WHAT IS ON THE SCREEN — declared, so the engine draws it.
   *
   * ⚠️ THE SAME BARGAIN `story` MAKES, ONE STEP FURTHER. A story declares the
   * questions and leaves the controls to the screen, because a camera and a
   * barcode viewfinder are not fields. A body declares the BLOCKS, and a block
   * is a registered component with named slots — so what cannot be declared is
   * still a component with a name in the design package, rather than a file
   * inside one product that no other product can reach.
   *
   * ⚠️ ABSENT MEANS THE SCREEN DRAWS ITSELF, and that is how every screen works
   * today. The two coexist on purpose: an app ports a screen at a time, and a
   * migration that required all of them at once would never start.
   */
  readonly body?: SurfaceSpec;
}

/**
 * WHETHER THE SCREEN DOOR IS THE ONE THAT ANSWERS THIS SCREEN.
 *
 * A body is read and a story is walked, and both are drawn from what
 * `/api/screen/<id>` sends — the views, the record, the acts and their input. A
 * screen with neither is the app's own code and asks the door for nothing.
 *
 * ⚠️ ONE ANSWER, BECAUSE THE DOOR HELD A SECOND ONE AND IT WAS WRONG. It matched
 * on a body alone, so every declared flow 404'd: the browser's `acts` map stayed
 * empty, the flow drew nothing, and what a person saw was the shell around a
 * blank page — no problem, no skeleton, nothing to say what had happened. The
 * read layer under it was already right and was never reached. Anything deciding
 * what the door will answer asks here rather than re-deciding.
 */
export const isDrawn = (screen: ScreenSpec): boolean =>
  Boolean(screen.body ?? screen.story);

/** A flow of questions, declared. */
export interface StorySpec {
  /**
   * THE ONE OPERATION THE WHOLE FLOW EXISTS TO REACH.
   *
   * ⚠️ ONE, AND THAT IS A DEFINITION RATHER THAN A LIMIT. A flow with two writes
   * is two flows, and the moment a second is needed the honest edit is a second
   * story — because the review at the end summarises ONE thing being made, and a
   * screen that commits two of them cannot be reviewed at all.
   */
  readonly writes: string;
  /**
   * WHICH OF THE WRITE'S INPUTS START AT A SETTING THE WORKSPACE ALREADY CHOSE —
   * the input's name to the setting's id.
   *
   * ⚠️ IT EXISTS BECAUSE A PREFERENCE THAT DOES NOT REACH THE FLOW IS A
   * PREFERENCE NOBODY SET. OneInventory declares `inventory.default_unit`, whose
   * own comment reads "the workspace's own defaults, not this file's" — and it
   * was applied by the scan path and by the import path and NOT by the screen a
   * person actually adds a product on. The two implicit paths honoured it; the
   * deliberate one asked, with an empty box, at a workspace that had already
   * answered exactly that question.
   *
   * ⚠️ AND IT ARRIVES AS AN ANSWER RATHER THAN AS A PLACEHOLDER, which is the
   * difference that matters. A default drawn faintly into a control is a value
   * somebody has to notice and accept; one that ARRIVES is a step that moves into
   * the review — the same shape a fill produces, and the reason a flow can
   * confirm rather than ask. A step declaring `always` is still asked, with the
   * workspace's answer already chosen, which is right for a decision somebody
   * must make rather than confirm.
   */
  readonly starts?: Readonly<Record<string, string>>;
  /**
   * WHAT THE FLOW SUPPLIES ITSELF AND NEVER ASKS FOR — the write's input name to
   * where the value comes from.
   *
   * ⚠️ IT IS AN ACT'S `fills`, ON A FLOW, AND THE ABSENCE WAS A REAL HOLE. A body
   * has supplied the device's day to every act since `Fill` was written; a story
   * had `starts`, which reads a SETTING, and nothing else — so a write taking a
   * required `day` could not be reached by a flow at all. The import flow found
   * it by being refused at composition, which is the guard working.
   *
   * ⚠️ AND "On what day?" IS NOT A QUESTION ANYBODY SHOULD BE ASKED. The answer
   * is on the device, it is right every time, and a step for it is a screen in a
   * wizard whose whole content is a date somebody has to agree with.
   *
   * ⚠️ IT IS THE SAME `Fill` A BODY USES, deliberately: `record` is meaningless
   * on a flow that is making something, and the composition check refuses it
   * there — but `today`, `year` and `says` mean exactly what they mean
   * everywhere else, and a second vocabulary for "a value nobody types" is how
   * the two come to disagree.
   */
  readonly holds?: Readonly<Record<string, Fill>>;
  /**
   * AN OPERATION WHOSE OUTPUT ARRIVES AS ANSWERS, BEFORE ANYBODY IS ASKED.
   *
   * ⚠️ THIS IS WHAT TURNS A FLOW FROM ASKING INTO CONFIRMING, AND IT IS THE
   * WHOLE ARGUMENT FOR THE SHAPE. Six photographs of a box come back as a name,
   * a brand, a unit, a rung, a shelf life and four filing words — twenty fields
   * that nobody audits across eight screens. Every step whose fields arrive
   * filled is not asked; it goes to the review as a clause, one press from the
   * step that corrects it. Reading a paragraph and fixing one word is a job
   * somebody actually does; confirming twenty fields is one they skip.
   *
   * ⚠️ IT SHARES KEYS WITH `writes`'s INPUT, WHICH IS THE JOIN AND IS CHECKED. A
   * fill whose output names nothing the write takes is an operation that runs,
   * costs credits and answers into a flow that drops every value — green
   * everywhere, and the person is asked all eight questions anyway.
   *
   * ⚠️ AND IT IS AN OPERATION RATHER THAN A HOOK, so what a flow will ask a model
   * is a fact about the product: the docs list it, an agent can be told, and the
   * credits it spends are metered on the same rail as every other run.
   */
  readonly fills?: FillsSpec;
  /**
   * WHAT THIS FLOW WOULD DO, WORKED OUT BEFORE IT DOES IT — see `ShowsSpec`.
   *
   * ⚠️ IT IS `fills` RUN AT THE OTHER END OF THE FLOW, AND THE MIRROR IS EXACT.
   * A fill runs before anybody is asked and arrives as ANSWERS; this runs when
   * every answer is in and arrives as a REPORT, on the review, above the press.
   * Neither is a hook: both name an operation, so what a flow will do before it
   * commits is a fact about the product rather than a line in one screen.
   *
   * ⚠️ AND THE FLOW IT EXISTS FOR IS THE ONE WHOSE PRESS CANNOT BE UNDONE BY
   * LOOKING AT IT. A spreadsheet is eight hundred rows and one column read
   * wrongly puts a supplier's name in every product name; the refusals are
   * eleven rows nobody can find afterwards. A review that recaps the ANSWERS
   * ("a spreadsheet, today") is true and says nothing, because the answer is not
   * where the consequence is.
   */
  readonly shows?: ShowsSpec;
  /**
   * THE QUESTIONS, IN ORDER, INCLUDING THE ONES THAT ARE OFTEN SKIPPED.
   *
   * ⚠️ DECLARED EVEN WHERE `when` REMOVES THEM AT RUNTIME. This is what the flow
   * CAN ask; which of them a given person is actually asked depends on their
   * answers, and a manifest that only listed the unconditional steps would
   * describe a flow nobody ever walks.
   */
  readonly asks: readonly StepSpec[];
  /**
   * THE WORD ON THE LAST PRESS.
   *
   * ⚠️ IT WAS "Add it", IN THE PLATFORM, FOR EVERY FLOW IN EVERY APP — the same
   * shape as `lands` before it: one product's sentence about one product,
   * written where every product reads it. It said "Add it" over a button that
   * applies eight hundred rows of a spreadsheet, and it would have said it over
   * a flow that closes something.
   *
   * ⚠️ ABSENT KEEPS "Add it", because most flows do make a thing and the default
   * is right for them. What a flow may not do is be unable to say otherwise.
   */
  readonly does?: string;
  /**
   * WHERE SOMEBODY IS STANDING WHEN THE FLOW IS OVER — a screen this app
   * declares, opened on the record the write answered with.
   *
   * ⚠️ IT EXISTS BECAUSE THE ALTERNATIVE WAS A PRODUCT'S ROUTE TYPED INTO THE
   * PLATFORM. `Declared.tsx` went to `/products` after every flow in every app,
   * because the first flow written happened to be a product's — and the second
   * app's would have landed on a list it does not have. A destination is a fact
   * about the flow, so it is declared where the flow is.
   *
   * ⚠️ AND IT IS THE THING JUST MADE, NOT THE LIST IT JOINS. Landing on a list
   * of eight hundred rows asks somebody to find what they were holding a second
   * ago; landing on it is the only screen that can say what is still missing —
   * which for a new product is that it is not on a shelf yet. That is the whole
   * next step, and a list cannot offer it.
   *
   * ⚠️ ABSENT IS A REAL ANSWER: the flow ends where it started, which is right
   * for one that records something rather than making it — a count, a delivery,
   * anything whose subject is the screen somebody was already on.
   */
  readonly lands?: string;
}

/**
 * WHAT RUNS BEFORE ANYBODY IS ASKED, AND WHAT IT IS HANDED.
 *
 * ⚠️ THE `with` IS THE HALF THAT LOOKS OPTIONAL AND IS NOT. Two operations that
 * were written independently name the same thing differently — the reader takes
 * `images` and the write keeps `shots` — and without a stated mapping the code
 * that bridges them is a line inside one product's screen, which is exactly the
 * hand-written file this whole contract removes.
 *
 * ⚠️ AND IT MAKES BOTH DIRECTIONS FACTS. What a model is GIVEN is `with`; what it
 * may WRITE is its own output intersected with the write's input. Both are in the
 * manifest, so "what does this flow send to an AI" is a question with an answer
 * that does not require reading a component.
 */
export interface FillsSpec {
  /** The operation. Its credits meter on the same rail as every other run. */
  readonly by: string;
  /**
   * WHAT IT IS HANDED — its own input name, and the write's input that supplies it.
   *
   * ⚠️ THE WRITE'S NAME ON THE RIGHT, WHICH IS THE WAY ROUND THAT CHECKS. Every
   * value here has to be a field some step or block ANSWERS, or the fill runs on
   * nothing: an empty photograph list sent to a vision model is a charge for a
   * question about no pictures, answered with plausible nothing.
   */
  readonly with: Readonly<Record<string, string>>;
}

/**
 * WHAT A FLOW WOULD DO, ASKED OF AN OPERATION AND DRAWN ON THE REVIEW.
 *
 * ⚠️ A COUNT PER OUTCOME, WHICH IS THE ONE SHAPE "WHAT WILL THIS DO" HAS. Four
 * hundred and twelve added, sixty-one changed, eleven refused — three numbers a
 * person weighs in a second, against a row-by-row list of eight hundred that
 * nobody reads and that would need a screen of its own. `take` names the output
 * field holding them, and it is `Record<string, number>` because anything richer
 * is a surface rather than a summary.
 *
 * ⚠️ AND IT RUNS ON THE REVIEW RATHER THAN ON EVERY ANSWER. The operation reads
 * the whole sheet, so running it per keystroke would be a round trip over four
 * hundred kilobytes on a flow whose first step is a paste. Once, when there is
 * something to decide about.
 *
 * ⚠️ THE OPERATION MUST NOT WRITE ANYTHING, AND NOTHING HERE CAN CHECK THAT. It
 * is `kind: "write"` in practice — a body of eight hundred rows cannot travel in
 * a query string, so a report is a POST like everything else, and `product.preview`
 * says exactly that on itself. What this contract can say is that a flow shows
 * its consequences with one operation and commits with another, and a manifest
 * naming the SAME one for both is refused: that is not a preview, it is the
 * import running twice.
 */
export interface ShowsSpec {
  /** The operation that works it out. */
  readonly by: string;
  /**
   * WHAT IT IS HANDED — its own input name, and the write's input that supplies
   * it. Same direction as `FillsSpec.with`, and checked the same way: a value
   * naming nothing a step answers is a report computed over nothing.
   */
  readonly with: Readonly<Record<string, string>>;
  /** Which of its outputs holds the counts. */
  readonly take: string;
  /**
   * ⚠️ THE WORD AFTER EACH NUMBER, BECAUSE THE ENGINE HAS NO NOUNS. A key
   * reading `made` is a column name; "added" is what a person is being asked to
   * agree to. Absent keys are drawn under their own key, which is honest and
   * ugly — the same bargain every other generated label makes.
   */
  readonly says?: Readonly<Record<string, string>>;
}

/**
 * HOW A STEP'S ANSWER READS BACK IN THE REVIEW.
 *
 * ⚠️ WRITTEN ONCE, ON THE STEP, WHICH IS THE MECHANISM RATHER THAN THE STYLE. The
 * review is built out of these; written a second time in a summary they would
 * drift the first time somebody edited one, and a summary that disagrees with
 * the screen it summarises is worse than none because it is the half people
 * trust.
 *
 * ⚠️ AND IT IS THE PRODUCT'S WORDS, NOT THE ENGINE'S. "Each delivery is kept
 * apart, so you can expire one or recall one" is a sentence about a thing on a
 * shelf; the engine has no nouns and could only supply the blank.
 */
export type SaysSpec =
  /**
   * ONE SENTENCE WITH THE ANSWERS IN BLANKS — `"counted in {unit}"`.
   *
   * ⚠️ EVERY `{name}` NAMES A FIELD THIS STEP TAKES, and a blank that names
   * anything else is refused. Left unchecked it renders as the literal braces in
   * the middle of a review somebody is reading to decide whether to commit.
   */
  | { readonly as: string }
  /**
   * ONE SENTENCE PER VALUE OF A CLOSED SET.
   *
   * ⚠️ THE STEP MUST TAKE EXACTLY ONE `enum`, AND EVERY VALUE MUST HAVE A
   * SENTENCE. A missing one is the single most-likely-to-ship gap here: it is
   * invisible until somebody picks the fifth option, and what they get is a
   * review with a line silently absent — the fact they chose most deliberately
   * being the one the summary does not mention.
   */
  | {
    readonly per: Readonly<Record<string, string>>;
    /**
     * THE CONNECTIVE IN FRONT OF WHICHEVER SENTENCE APPLIES — "tracked so that
     * it is".
     *
     * ⚠️ HERE RATHER THAN REPEATED IN EVERY `per` SENTENCE, which is what the
     * five values would otherwise each have to carry. It exists only on this
     * variant because `as` is one sentence the app writes whole, connective
     * included — "counted in {unit}" — and a lead beside it would be a second
     * place the same words could live.
     *
     * ⚠️ AND IT IS PROSE-CASED, BECAUSE IT LANDS MID-SENTENCE. The recap is one
     * paragraph and the leads are its joins; the FRAME capitalises the first
     * character of the whole sentence and nothing else, so a lead written as a
     * heading reads as one — "…, Tracked so that it is…". `under` was doing this
     * job and could not: it is the line under the question, where a capital is
     * correct, and one string cannot be both.
     */
    readonly lead?: string;
  };

export interface StepSpec {
  readonly id: string;
  /**
   * ⚠️ A QUESTION, AND THE `?` IS LOAD-BEARING. A step headed "Counting" names
   * the area of the record being written and leaves the person to work out what
   * is wanted of them; a question has an answer, and somebody who can answer it
   * needs no training to. The guard refuses a heading.
   */
  readonly ask: string;
  /** ⚠️ One fact, where one is needed. Never a description of the screen. */
  readonly under?: string;
  /**
   * THE FIELDS THIS STEP ASKS FOR, BY NAME, OUT OF `writes`'s OWN INPUT.
   *
   * ⚠️ THIS IS THE FIELD THAT CLOSES THE FLOW, AND ITS ABSENCE IS WHY THE WIZARD
   * WAS ORPHANED. A step used to name a question and nothing else, so the
   * controls under it had to be written by hand — which meant a flow was a
   * declaration plus a React file, the file was what a surface rewrite deletes,
   * and what survived was a declaration nothing could draw. An operation already
   * declares its input as `FieldSpec`s: kind, label, whether it is required, the
   * closed set and the words for it, the bounds, the collection a reference
   * points at. That is everything a control needs, so the engine draws them.
   *
   * ⚠️ THE SAME BARGAIN A BODY MAKES, AND THE SAME ESCAPE. What is not a field is
   * a `block` — the open set, registered in the design package where every
   * product can reach it, rather than a file inside one product that no other
   * can. A camera is not a field; it is also not a reason for every flow to be
   * hand-written.
   */
  readonly takes?: readonly string[];
  /**
   * A REGISTERED BLOCK, FOR A STEP THAT IS NOT FIELDS.
   *
   * ⚠️ AND A BLOCK MAY ANSWER. A photo strip collects images, runs the story's
   * `fills`, and hands back a partial set of answers that lands in the flow —
   * which is how the model's work reaches the review. That is one mechanism, not
   * two: a step contributes answers whether it drew controls or a block.
   */
  readonly block?: string;
  readonly says?: SaysSpec;
  /**
   * ASKED EVEN WHEN THE ANSWER ALREADY ARRIVED.
   *
   * ⚠️ FOR THE DECISION SOMEBODY MUST MAKE RATHER THAN CONFIRM. Most fields a
   * model proposes are facts about the box and are right or wrong on their face
   * — a name, a brand, a shelf life — and skipping to a review is the whole
   * point. A few are not facts at all: how closely a thing is tracked decides
   * whether a delivery can be expired or recalled, and a person accepting it by
   * not noticing it in a paragraph has not decided anything.
   *
   * ⚠️ IT IS OPT-IN BECAUSE THE DEFAULT MUST BE THE CHEAP ONE. A flow where
   * every step insists on being asked is the form this replaced, wearing a
   * progress bar.
   */
  readonly always?: true;
  /**
   * WHEN THIS STEP APPLIES AT ALL — against an answer earlier in the flow.
   *
   * ⚠️ IT IS `Match`, WHICH IS THE VOCABULARY A VIEW ALREADY NARROWS WITH.
   * Equality and presence, no `gt`, no `lt`, none of them coming — and the reason
   * is the same one at both ends: the first comparison operator is what makes a
   * manifest a language and the second is free. What differs is the SUBJECT: a
   * view's `field` is a column of a collection, and here it is a field of the
   * write's own input. Same shape, checked against a different set of names.
   *
   * ⚠️ IT WAS A BARE STRING AND THAT COULD NOT BE INTERPRETED. Whatever the
   * string meant, the screen that read it was the app's — which is exactly the
   * hand-written file this contract exists to remove, moved into one field.
   *
   * ⚠️ A STEP THAT DOES NOT APPLY IS SKIPPED, NEVER DISABLED — out of the flow,
   * out of the count, out of the progress and out of the review. A greyed step is
   * a question somebody has to work out they are not being asked.
   */
  readonly when?: Match;
}

/** A place somebody works — a loop, not a flow. */
export interface SessionSpec {
  /**
   * HOW A THING GETS INTO IT.
   *
   * ⚠️ THE ONE FACT THAT DECIDES WHAT THE SCREEN IS. A session fed by a camera
   * runs a decode loop and needs the viewfinder to be most of the page; one fed
   * by a typed code is a field and a list; one fed by a file is a chooser and a
   * preview. Nothing downstream can work that out, and it is the first thing
   * anybody asks about a screen they cannot see.
   */
  readonly by: "camera" | "code" | "file" | "hand";
  /**
   * EVERY WRITE IT MAY MAKE.
   *
   * ⚠️ SEVERAL, WHICH IS WHAT MAKES IT NOT A STORY. A flow reaches ONE write and
   * ends; a session makes the same write over and over and usually one more to
   * take the last one back. Listing them is what lets the screen's `permission`
   * be checked against what it will actually ask for — two hand-typed strings in
   * two files, with nothing checking they matched, is a session somebody works
   * for twenty minutes and is refused at the first write.
   */
  readonly writes: readonly string[];
  /**
   * WHAT SURVIVES BETWEEN THE WRITES, AND WHAT DOES NOT.
   *
   * ⚠️ THIS IS THE WHOLE SHAPE OF THE WORK AND IT WAS WRITTEN NOWHERE. A shelf
   * moves the session and stays; a product fills the row and is cleared the
   * moment it is recorded, so the next scan cannot land on the last one's
   * quantity. Get that backwards and the screen silently books everything to one
   * shelf, or asks for the shelf forty times.
   */
  readonly keeps: readonly KeptSpec[];
}

export interface KeptSpec {
  readonly id: string;
  /** ⚠️ What it is, in the reader's words — never the variable's name. */
  readonly is: string;
  /** ⚠️ `between` survives every write; `once` is cleared after each. */
  readonly until: "between" | "once";
}

/**
 * ⚠️ EVERY FIELD BELOW PRODUCES SURFACES NOBODY WRITES. That is the contract: an
 * app declares, and the settings screens, the policy screen, the flag console,
 * the plan shelf, the consent sheet, the processing record, the job console, the
 * help centre and the onboarding checklist all exist as a consequence.
 */
export interface AppSpec {
  readonly id: AppId;
  readonly name: string;
  readonly mark: string;
  /**
   * THE PRODUCT'S OWN COLOUR, AND THE PRODUCT IS THE ONE THING THAT MAY DECLARE
   * IT.
   *
   * ⚠️ THIS USED TO BE A WORKSPACE'S. Every relationship a designer had chosen —
   * the light against the ground, the wash against the card, the one coloured
   * thing on a screen — was then decided by whoever spent ten seconds in a
   * colour picker, and no screen could be designed because no screen knew what
   * it would be made of. A workspace keeps its NAME and its MARK; what a product
   * is made of belongs to whoever built it.
   *
   * ⚠️ ONE VALUE, NOT A PALETTE. It reaches the ground, the light, the wash and
   * the halo through the scene engine's `lit` slot, so an app that names a hue
   * once wears it everywhere with nothing else edited — and an app that names
   * none is monochrome, which is the right default and what most screens want.
   *
   * ⚠️ OKLCH, SO IT IS THE SAME APPARENT BRIGHTNESS IN BOTH THEMES. An sRGB hex
   * tuned against the night ground is a different lightness against paper, which
   * is how one product comes to look confident in the dark and washed out in the
   * light.
   */
  readonly hue?: string;

  readonly access: AccessSpec;
  /**
   * ⚠️ KEYS ONLY. An app declares what it SELLS — `notes`, `clients` — and the
   * deployment's plans say how many of each every tier gets. Plans left this
   * file when the membership became one: seats, storage and the wallet are one
   * roster, one bucket and one balance, so a per-app plan cannot say which
   * product a gigabyte belongs to.
   */
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
  readonly collections: readonly CollectionSpec[];
  readonly operations: readonly AnyOperation[];
  readonly screens: readonly ScreenSpec[];
  /**
   * ⚠️ THE QUERIES ITS SCREENS READ, DECLARED ONCE AND NAMED. Two screens asking
   * "what is expiring" with two hand-written filters is two answers to one
   * question, and they drift the first time the rule changes. A view is one
   * answer, checked against the collection it reads at composition.
   */
  readonly views?: readonly ViewSpec[];
  readonly problems?: ProblemCatalog;

  readonly notifications?: NotificationBook;
  readonly settings?: SettingBook;
  /**
   * ⚠️ THE PAGES ITS SETTINGS LIVE ON. Every declared setting names one, and an
   * area nothing names is refused — so a settings surface is a list of
   * destinations that each open onto something, rather than one column of every
   * row the app happens to declare (DESIGN.md §3).
   */
  readonly settingAreas?: AreaBook;
  readonly flags?: FlagBook;
  readonly vault?: VaultBook;
  readonly purposes?: PurposeBook;
  readonly documents?: DocumentBook;
  readonly processors?: SubProcessorBook;
  readonly jobs?: JobBook;
  /**
   * ⚠️ WHAT THIS PRODUCT NEEDS UNDERNEATH IT — a queue, a bucket, a model lane.
   * Declared rather than configured, so the reconciler can make it exist, the
   * residency rule can refuse it, and the processing record can name it. See
   * `infra.ts`.
   */
  readonly needs?: NeedBook;
  /**
   * ⚠️ HOW FAR ONE PERSON'S REACH GOES INSIDE A WORKSPACE (`reach.ts`). Absent
   * means a workspace is one place and everybody in it reaches all of it, which
   * is true of most products and must stay the default — a business with one
   * site never meets this concept.
   */
  readonly reach?: ReachDef;
  readonly meters?: MeterBook;
  readonly lanes?: readonly Lane[];
  readonly whitelabel?: WhitelabelDef;
  readonly help?: HelpBook;
  readonly guide?: GuideBook;
  readonly milestones?: MilestoneBook;
}

/* ------------------------------------------------------------------- nav --- */

/**
 * ⚠️ FIVE PRIMARY DESTINATIONS, MAXIMUM (D10). Past five a bottom bar stops
 * being tappable and becomes a menu — and a nav item added because a feature had
 * nowhere else to go is a sign the feature belongs inside an existing one.
 */
/**
 * WHAT EVERY APP CAN ASK FOR WITHOUT DECLARING IT — by operation, its answer's
 * fields.
 *
 * ⚠️ THE PLATFORM MOUNTS THESE AND NO MANIFEST HOLDS THEM, which is exactly why
 * they are written here. `refuseApp` checks an asked view against the app's own
 * operations; a platform read is not in that list, so a body naming one was
 * refused as naming nothing — and the screen that wanted a total went back to
 * asking three lists for one row each, which is the shape `totals.read` exists
 * to end.
 *
 * ⚠️ AND THE FIELDS ARE NAMED, NOT WAIVED. Listing the operation and skipping
 * the `take` check would let a body read a field the answer does not carry —
 * silently, as an empty region — which is the same failure the check catches for
 * an app's own operations. The names here and the object the runtime returns are
 * two spellings of one shape, and the same rule `SCREEN_PATH` follows applies:
 * both ends speak it, so it is written once in the layer both may reach.
 */
export const SHARED_READS: Readonly<Record<string, readonly string[]>> = {
  /* ⚠️ `counts` is the record, keyed by collection; `all` is the same numbers as
     a list of one, which is the shape an asked view can bind. */
  "totals.read": ["counts", "all"],
};

export const PRIMARY_MAX = 5;

export const primaryOf = (screens: readonly ScreenSpec[]): readonly ScreenSpec[] =>
  screens.filter((s) => s.nav === "primary");

/* --------------------------------------------------------------- address --- */

/**
 * WHETHER A PATH IS THIS SCREEN'S OWN ADDRESS OR SOMETHING BENEATH IT.
 *
 * ⚠️ A DETAIL SCREEN IS ABOUT SOMETHING, AND WHAT IT IS ABOUT LIVES IN THE
 * ADDRESS. `/thing/t-glove` is the product screen showing one product — so it is
 * linkable, reloadable, and something support can ask somebody to open. Held in
 * component state instead, a list and the record it opened share one address and
 * the back button leaves the product.
 *
 * ⚠️ AND THE ROOT IS NEVER A PREFIX OF ANYTHING. `/` would otherwise match every
 * path in the app, so the root screen would answer for a detail screen declared
 * beside it — with the nav highlighting the root while a different screen is on
 * the page.
 */
export const isUnder = (route: string, path: string): boolean =>
  path === route || (route !== "/" && path.startsWith(`${route}/`));

/**
 * WHICH DECLARED SCREEN A PATH BELONGS TO — the most specific one.
 *
 * ⚠️ LONGEST WINS, WHICH IS NOT A PREFERENCE. `/thing` and `/thing/history`
 * both match `/thing/history/t-glove`, and answering with the shorter one draws
 * a different screen from the one somebody linked to. Declaration order is
 * whatever an author happened to type, so it cannot be the tie-break.
 */
export const screenFor = <T extends { readonly route: string }>(
  screens: readonly T[], path: string,
): T | undefined =>
  screens
    .filter((s) => isUnder(s.route, path))
    .sort((a, b) => b.route.length - a.route.length)[0];

/**
 * WHAT A SCREEN'S ADDRESS SAYS IT IS ABOUT — the segments past its own route.
 *
 * ⚠️ AN ARRAY RATHER THAN AN `id`, because a screen may be about more than one
 * thing (a product on a shelf is both), and because a screen that took a single
 * id would grow a second parameter as a query string — which is the one part of
 * an address nothing here parses.
 */
export const beneath = (route: string, path: string): readonly string[] => {
  if (!isUnder(route, path)) return [];
  const rest = route === "/" ? path.slice(1) : path.slice(route.length + 1);
  return rest ? rest.split("/").filter(Boolean) : [];
};

/**
 * WHAT IS ABOVE THIS SCREEN — where a way back leads, derived from the manifest.
 *
 * ⚠️ A SCREEN SOMEBODY WENT TO HAS A WAY BACK AND A DESTINATION DOES NOT, and
 * that distinction is already declared: `nav: "primary"` is one of the five the
 * bar navigates BETWEEN, and everything else is somewhere you arrived. So a
 * product's detail screen gets an arrow and its Stock tab does not, without
 * either of them saying so.
 *
 * ⚠️ THE COLLECTION'S OWN LISTING FIRST, WHICH IS THE ONE PLACE SOMEBODY COULD
 * HAVE COME FROM. `onAside` in the renderer already derived exactly this to
 * decide where a screen goes when its record is put away, with a comment saying
 * why a route written by hand would be a second spelling of an address the
 * manifest holds — and a second copy of that walk is how the arrow and the
 * disappearing record come to disagree about where "back" is.
 *
 * ⚠️ AND THE APP'S ROOT IS THE FALLBACK RATHER THAN NOTHING. A screen reached
 * from a search or a shortcut has no listing above it and still has to be
 * leavable; home is where every product's nav starts, so it is the honest "up"
 * — and it is `undefined` for the root itself, which has nothing above it at all.
 *
 * ⚠️ IT IS NOT THE BROWSER'S HISTORY, DELIBERATELY. History back is right when
 * there is any and wrong when a link was opened cold — it leaves the product
 * entirely, which is the one thing a back arrow inside an app must never do —
 * and nothing can tell the two cases apart from inside the page.
 */
export const upFrom = <T extends {
  readonly id: string;
  readonly route: string;
  readonly of?: string;
  readonly nav?: "primary" | "none";
  readonly body?: SurfaceSpec | undefined;
}>(screens: readonly T[], screen: T): T | undefined => {
  if (screen.nav === "primary" || screen.route === "/") return undefined;
  const home = screens.find((s) => s.route === "/");
  /*
    ⚠️ THE LIST WHOSE ROWS OPEN THIS SCREEN, WHICH IS THE EDGE SOMEBODY CAME
    ALONG. This asked whether a list screen names the same `of` — and `of` means
    "the record this screen is ABOUT", which is false of a catalogue, so no list
    screen in any manifest ever declared one and the arm was reached by nothing:
    every sub-page in every product went back to home whatever it was a sub-page
    OF. `goes` is the link itself, it is already written down, and it is the only
    thing in the manifest that says one screen leads to another.

    ⚠️ DERIVED RATHER THAN DECLARED, which is the argument the arrow itself was
    given. A screen naming its own parent would be a second spelling of a
    relationship the manifest holds, and the two drift the first time a list
    moves — which is the same reason `goes` takes a screen id rather than a
    route.

    ⚠️ AND SEVERAL LISTS MAY LEAD HERE, WHICH IS ORDINARY RATHER THAN A FAULT. A
    product is opened from the catalogue, from a shelf line, from what ran out
    and from what is going out of date. The first DECLARED wins, which is the
    order somebody wrote the product in — and the catalogue is the screen a
    product is about, so it is the one that is written first.
  */
  const opens = (one: T): boolean => Boolean(one.body)
    && one.body!.shape === "list"
    && blocksIn(one.body!).some((b) => b.block.goes && goOf(b.block.goes).to === screen.id);
  return screens.find((s) => s !== screen && opens(s)) ?? home;
};

/* --------------------------------------------------------------- derived --- */

/**
 * Every event this app raises.
 *
 * ⚠️ INCLUDING THE ONES NOBODY WROTE. A collection's generated writes raise
 * events exactly as a declared operation does, and leaving them out here would
 * make the manifest refuse a notification about a note being created — the most
 * ordinary thing an app could possibly want to be told about.
 */
export const eventsOf = (spec: AppSpec): readonly string[] => [...new Set([
  ...spec.operations.flatMap((o) => o.emits ?? []),
  ...spec.collections.flatMap(eventsFor),
  /*
    ⚠️ AND THE ONES NOBODY IS PRESENT FOR. The whole reason a night's work is
    worth doing is that it finds something before a person would — stock that
    expires on Thursday, a service that is due. Left out here, every
    notification the sweep exists to send is refused at composition as waiting
    for an event nothing raises, and the only way to ship one is to attach it to
    an unrelated operation somebody happens to perform.
  */
  ...Object.values(spec.jobs ?? {}).flatMap((j) => j.emits ?? []),
])];

/**
 * WHAT A PERSON CAN CAUSE — everything above except the clock's own.
 *
 * ⚠️ A CHECKLIST IS TICKED BY WHAT SOMEBODY DID, and a nightly sweep finding an
 * expiring batch is not something they did. The tally the guide reads counts
 * operation raises only, so a step on a job-only event would sit unticked for
 * ever with nothing anywhere saying why — see `refuseGuide`.
 */
export const eventsDone = (spec: AppSpec): readonly string[] => [...new Set([
  ...spec.operations.flatMap((o) => o.emits ?? []),
  ...spec.collections.flatMap(eventsFor),
])];

/**
 * ⚠️ THE VAULT KEY IS DERIVED FROM WHERE THE FIELD IS, never declared beside it.
 * Two names for one fact is how a field ends up pointing at a vault entry that
 * does not exist — a pointer column with nothing behind it, which reads on the
 * screen as a value somebody never filled in.
 */
export const vaultKeyFor = (collection: string, field: string): string => `${collection}.${field}`;

const vaultBackedIn = (spec: AppSpec): readonly string[] =>
  spec.collections.flatMap((c) =>
    Object.entries(c.fields).filter(([, f]) => f.vault).map(([name]) => vaultKeyFor(c.id, name)));

/** Every category of personal data this app holds anywhere, including the vault. */
export const holdingsOf = (spec: AppSpec): readonly Holding[] => [...new Set([
  ...spec.collections.flatMap((c) => holdingsIn(c.fields)),
  ...Object.values(spec.vault ?? {}).map((f) => f.holding),
])];

/**
 * EVERY NEED THIS APP HAS — the ones it declared, and the one its own fields
 * imply.
 *
 * ⚠️ READ THIS RATHER THAN `spec.needs`, EVERYWHERE. A caller reading the raw
 * declaration sees an app with a media field and no bucket, provisions nothing,
 * and the first upload fails against a binding that was never asked for. There
 * is one derived need today and the shape matters more than the count: a
 * concern the platform can work out for itself is never an app's to remember.
 */
export const needsOf = (spec: AppSpec): NeedBook => {
  const files = spec.collections.some((c) =>
    Object.values(c.fields).some((f) => f.kind === "media"));
  const derived = mediaNeedFor(files);
  return { ...(derived ? { [derived.id]: derived } : {}), ...(spec.needs ?? {}) };
};

/* ------------------------------------------------------------ inheritance --- */

/**
 * WHAT EVERY PRODUCT ON A DEPLOYMENT INHERITS, APPLIED IN ONE PLACE.
 *
 * ⚠️ THE INFRASTRUCTURE SUB-PROCESSORS ARE THE DEPLOYMENT'S, NOT A PRODUCT'S.
 * The records are in one database, the objects in one bucket and the code on one
 * runtime — the same vendor behind every app here, whether or not each app's
 * author remembers to write it down. Declared per app it is one chance per
 * product to forget, and an undisclosed recipient is the disclosure failure
 * regulators actually find. An app adds only what is genuinely its own: a
 * payment gateway one product uses, a model provider only one product calls.
 *
 * ⚠️ AND WHAT IT RECEIVES IS NARROWED TO WHAT THIS APP ACTUALLY HOLDS. The
 * deployment says "our infrastructure holds everything we hold"; per product,
 * that is only the categories that product collects. Listing a special category
 * against an app that has never held one is a processing record describing
 * something that does not happen — and `refuseLegal` would rightly refuse it.
 *
 * ⚠️ DOCUMENTS DO NOT MERGE, DELIBERATELY. The deployment's terms are asked of
 * the person once, by `owedBy`, against acceptances with no app in them; folded
 * into an app's book they would be asked AGAIN per app and recorded per app —
 * the same agreement, demanded once per product somebody opens.
 */
export function under(deployment: DeploymentLegal, spec: AppSpec): AppSpec {
  /* ⚠️ THE PLATFORM'S HOLDINGS COUNT TOO, and leaving them out is a
     narrowing that reads as a disclosure. This intersection exists so an app's
     page names only recipients its own data reaches — but every app's data
     travels with an email address, an account and an audit trail, which no
     manifest declares. Asked of the app alone, the company running the
     databases was disclosed as receiving special categories and NOT somebody's
     email address, which is the opposite of the truth. */
  const held = [...PLATFORM_HOLDINGS, ...holdingsOf(spec)];
  const base: Record<string, SubProcessorDef> = {};
  for (const p of Object.values(deployment.processors)) {
    const receives = p.receives.filter((h) => held.includes(h));
    if (!receives.length) continue;
    base[p.id] = { ...p, receives };
  }
  return { ...spec, processors: { ...base, ...(spec.processors ?? {}) } };
}

/* --------------------------------------------------------------- refusals --- */

export interface Refusal { readonly of: string; readonly why: string }

/**
 * Everything wrong with a manifest, in one pass.
 *
 * ⚠️ THE ORDER OF THE CHECKS IS THE ORDER A READER CAN ACT ON THEM: what is
 * malformed, then what is unreachable, then what is sold and unenforced, then
 * the surfaces. A missing permission reported after a dangling reference is a
 * second run.
 */
export function refuseApp(spec: AppSpec): readonly Refusal[] {
  const out: Refusal[] = [];
  const at = (of: string, why: string) => out.push({ of, why });

  /* ⚠️ Surfaces may NAME platform keys ("the money screen needs billing:read")
     even though the app may not DECLARE them — see `claimsPlatform`. */
  const permissions = [...spec.access.permissions, ...PLATFORM_PERMISSIONS, ...PLATFORM_PERSONAL];
  const routes = spec.screens.map((s) => s.route);
  const events = eventsOf(spec);

  /* --- what is malformed ------------------------------------------------- */

  for (const c of spec.collections) {
    for (const p of refuseCollection(c)) at(`collection ${p.collection}`, `${p.why}: ${p.detail}`);
  }
  for (const o of spec.operations) {
    for (const p of refuseOperation(o)) at(`operation ${p.operation}`, `${p.why}: ${p.detail}`);
  }
  for (const bad of danglingRefs(spec.collections)) at("reference", `${bad} points at no collection`);
  for (const p of refuseSettings(spec.settings ?? {}, spec.settingAreas ?? {})) at(`setting ${p.setting}`, `${p.why}: ${p.detail}`);
  for (const p of refuseFlags(spec.flags ?? {})) at(`flag ${p.flag}`, `${p.why}: ${p.detail}`);
  for (const p of refuseVault(spec.vault ?? {}, spec.purposes ?? {})) {
    at(`vault ${p.of}`, `${p.why}: ${p.detail}`);
  }
  for (const p of refuseJobs(spec.jobs ?? {}, Object.keys(spec.notifications ?? {}))) {
    at(`job ${p.job}`, `${p.why}: ${p.detail}`);
  }

  /*
    ⚠️ THE LADDER IS THE PLATFORM'S AND IS CHECKED HERE ANYWAY, because there is
    nowhere else it ever gets asked. Its rungs must climb — read-only, then
    blocked, then purged — and an edit that puts them out of order does not
    fail: it produces a workspace that is blocked before it is read-only, or
    purged before either. Nothing in the product called `refuseLadder`, so the
    only thing standing between a transposed pair and a deleted workspace was
    that nobody had transposed one.
  */
  for (const why of refuseLadder(LADDER)) at("standing", `the ladder ${why}`);

  /*
    ⚠️ AND WHAT AN APP OFFERS FOR BRANDING IS CHECKED AGAINST THE CLOSED SET.
    `whitelabel.surfaces` is a list of strings in a manifest, so a typo is a
    surface a workspace can never switch on and nothing anywhere says why — and
    a name from `OURS` would be an app offering to rebrand the operator console
    or a document we are bound by.
  */
  if (spec.whitelabel) {
    for (const p of refuseSurfaces({ surfaces: SURFACES }, spec.whitelabel.surfaces)) {
      at("whitelabel", `"${p.of}" ${p.detail}`);
    }
  }

  const ids = [...spec.collections.map((c) => c.id), ...spec.operations.map((o) => o.id)];
  for (const id of ids.filter((v, i) => ids.indexOf(v) !== i)) at("id", `"${id}" is declared twice`);

  /* --- what nobody can reach --------------------------------------------- */

  for (const key of unholdable(spec.access)) {
    at("permission", `"${key}" is declared and no app role holds it`);
  }
  for (const key of undeclared(spec.access)) {
    at("permission", `a role holds "${key}", which is not a declared permission`);
  }
  /* ⚠️ An app claiming a platform key would let a product update quietly mint
     workspace managers (D15). The fix is deletion, so it is its own refusal. */
  for (const key of claimsPlatform(spec.access)) {
    at("permission", `"${key}" is the platform's — an app may name it on a surface, never declare or bundle it`);
  }
  /*
    ⚠️ A PRESET IS OFFERED TO A WORKSPACE AND HAS TO BE ADOPTABLE. One naming a
    key this app does not declare is refused by `refuseRole` at the door — so it
    is a bundle drawn on a screen, offered, pressed, and refused with a sentence
    about somebody else's mistake.

    ⚠️ AND ITS ID MAY NOT BE A DECLARED ROLE'S. `registryWith` lets the app's own
    roles win, so adopting one would write a row that resolves to nothing and
    report success.
  */
  for (const preset of spec.access.presets ?? []) {
    if (!roleIdOk(preset.id)) {
      at("preset", `"${preset.id}" is not a role id — letters, numbers and dashes`);
    }
    if (spec.access.roles[preset.id]) {
      at("preset", `"${preset.id}" is already a role this app declares, so adopting it would do nothing`);
    }
    for (const key of preset.permissions) {
      if (!spec.access.permissions.includes(key)) {
        at("preset", `"${preset.id}" bundles "${key}", which this app does not declare`);
      }
    }
  }
  for (const why of unreachable(spec.operations,
    { ...PLATFORM_ROLES, ...spec.access.roles }, PLATFORM_PERSONAL)) {
    at("operation", why);
  }

  /* ⚠️ ASKED, NOT ASSUMED. `unrecordedWrites` states that every write says what
     to record or why not, and nothing called it — so the one class of operation
     that leaves no trace was refused nowhere. A write with neither an `audit`
     nor a reason is a change somebody made that the audit cannot show, which is
     discovered when somebody asks who did it. */
  for (const id of unrecordedWrites(spec.operations)) {
    at(`operation ${id}`, "a write that records nothing and says no reason — the change happens and the audit cannot show who made it");
  }

  /*
    ⚠️ SOMEBODY MUST BE ABLE TO USE A NEW TENANT'S APP. The platform makes the
    creator an `owner` (workspace authority is the platform's); this is the APP
    role they found in, and an app with no roles at all has no founding state.
  */
  if (!foundingAppRole(spec.access)) {
    at("access", "no app roles are declared, so a new workspace's creator would be nobody in it");
  }
  if (spec.access.founding && !spec.access.roles[spec.access.founding]) {
    at("access", `founding role "${spec.access.founding}" is not a declared role`);
  }
  for (const role of spec.access.seats.counts) {
    if (!(role in PLATFORM_ROLES)) at("access", `seats count "${role}", which is not a platform role`);
    if (role === "customer") at("access", "customers never cost a seat — they are the product, not the staff");
  }

  /* --- what is sold and not kept ----------------------------------------- */

  /*
    ⚠️ AN APP MAY NOT DECLARE WHAT THE PLATFORM SELLS. The roster is the
    platform's and `member.invite` is its gate; the bucket and the custom
    hostname are the platform's too. Two apps each declaring `seats` is two
    answers to how many people a workspace may have, and whichever composed
    first would win.
  */
  for (const key of Object.keys(spec.entitlements)) {
    if (key in PLATFORM_ENTITLEMENTS) {
      at("catalogue", `"${key}" is the platform's to sell, not an app's`);
    }
    /* ⚠️ AND THE ALLOWANCE IS NOT AN ENTITLEMENT AT ALL. Declaring it would put
       it in `keys`, which is the one list `walk` iterates — and that walk ends
       in a clamp that zeroes everything when standing stops. Correct for a
       permission; confiscation for a balance somebody paid for. */
    if (key === ALLOWANCE_KEY) {
      at("catalogue", `"${key}" is the wallet's allowance, not an entitlement`);
    }
  }
  /* ⚠️ AND A PRICE LIST IS THE DEPLOYMENT'S, WHOLE. Plans and credit packs both
     left this file when the membership became one — there is one wallet, so a
     pack an app declared would top up a shared balance that only that product
     could sell. `refuseCatalog` and `refusePacks` run over the deployment's own
     lists instead, in `deploymentFaults`. */
  if ("packs" in spec || "plans" in spec) {
    at("catalogue", "prices belong to the deployment, not to a product");
  }
  /* ⚠️ THE UNION, BECAUSE AN APP MAY COUNT AGAINST A PLATFORM KEY. It may not
     DECLARE one (above), but a collection is entitled to reference `seats` or
     `storage` — those are the workspace's, and referencing is not owning. */
  const holdable = { ...PLATFORM_ENTITLEMENTS, ...spec.entitlements };
  for (const why of quotasWithoutCeiling(spec.collections, Object.keys(holdable))) {
    at("quota", why);
  }

  /*
    ⚠️ A KEY IS ENFORCED IF AN OPERATION NAMES IT OR A COLLECTION COUNTS AGAINST
    IT. Anything else is on a price list and checked by nothing — which fails in
    the GENEROUS direction, so no customer complains and nothing goes red.
  */
  const named = [
    ...spec.operations.flatMap((o) => [o.entitlement, o.quota].filter(Boolean) as string[]),
    ...spec.collections.map((c) => c.quota).filter(Boolean) as string[],
    ...Object.values(spec.settings ?? {}).map((s) => s.entitlement).filter(Boolean) as string[],
    spec.access.seats.entitlement,
  ];
  for (const key of unenforced(spec.entitlements, named)) {
    at("entitlement", `"${key}" is sold and nothing withholds it`);
  }
  for (const key of named) {
    if (key && !(key in holdable)) at("entitlement", `"${key}" is enforced and nothing sells it`);
  }
  /*
    ⚠️ A SCREEN'S OWN KEY IS CHECKED AND DELIBERATELY NOT COUNTED. Checked
    because gating a destination on something no plan sells hides it from
    everybody forever; not counted because HIDING A SCREEN IS NOT WITHHOLDING A
    CAPABILITY — the operations behind it are still a door, and a key whose only
    enforcement is a missing nav row is a feature anybody can still call.
  */
  for (const s of spec.screens) {
    for (const key of s.features ?? []) {
      if (!(key in holdable)) {
        at(`screen ${s.id}`, `is gated on "${key}" and nothing sells it`);
      }
    }
    /* ⚠️ AND AN EMPTY LIST IS NOT "NO GATE", IT IS A GATE NOTHING SATISFIES —
       any-of over nothing is false. Declared that way the screen would be
       invisible on every tier, which reads at the call site as if it were open
       to all of them. */
    if (s.features && s.features.length === 0) {
      at(`screen ${s.id}`, "names an empty feature list, which no plan can satisfy");
    }
  }

  /* --- what a person is told --------------------------------------------- */

  const notifications = spec.notifications ?? {};
  for (const id of unaddressable(notifications, permissions)) {
    at(`notification ${id}`,
      `is addressed to a permission nothing declares, so its audience is always empty`);
  }
  for (const id of unraisable(notifications, events)) {
    at(`notification ${id}`, "waits for an event nothing raises, so it can never arrive");
  }
  for (const dead of deadLinks(notifications, routes)) {
    at("notification", `${dead} — which is not a screen`);
  }

  /* --- what a person can change ------------------------------------------ */

  for (const s of Object.values(spec.settings ?? {})) {
    if (s.needs && !permissions.includes(s.needs)) {
      at(`setting ${s.id}`, `may be changed by holders of "${s.needs}", which nothing declares`);
    }
  }

  /*
    ⚠️ A FLAG NOTHING READS IS A SWITCH THAT DOES NOTHING, which is worse than an
    absent feature: somebody turns it on, believes what it promised, and stops
    watching for the problem it claimed to solve.
  */
  const flagsNamed = [
    ...spec.operations.map((o) => o.flag).filter(Boolean) as string[],
    ...spec.screens.map((s) => s.flag).filter(Boolean) as string[],
  ];
  for (const id of unreadFlags(spec.flags ?? {}, flagsNamed)) {
    at(`flag ${id}`, "no operation and no screen is behind it, so switching it changes nothing");
  }
  for (const id of flagsNamed) {
    if (!(id in (spec.flags ?? {}))) at("flag", `"${id}" is read and nothing declares it`);
  }

  /* --- what is held, and what is disclosed -------------------------------- */

  /* ⚠️ ASKED, NOT REPEATED. `strayFacts` is this loop, in the kernel, with the
     argument for why it matters — and it was written out here instead, so the
     rule existed twice and the exported one had no caller at all. */
  for (const key of strayFacts(spec.vault ?? {}, vaultBackedIn(spec))) {
    at("vault", `${key} is vault-backed and no vault field declares it — the column would point at nothing`);
  }
  for (const p of refuseLegal(
    spec.documents ?? {},
    spec.processors ?? {},
    holdingsOf(spec),
    Object.values(spec.purposes ?? {}).some((x) => x.holdings.includes("sensitive")),
  )) {
    at(`legal ${p.of}`, `${p.why}: ${p.detail}`);
  }

  /* --- what it spends ----------------------------------------------------- */

  /* ⚠️ ASKED WITH NO RESIDENCY, WHICH IS THE APP-LOCAL HALF ON PURPOSE. Whether a
     queue can keep an EU promise depends on which jurisdictions the DEPLOYMENT
     serves, and an app does not know that — `deploymentFaults` asks the other
     half at boot and the reconciler refuses to bind it. What is answerable here
     is whether the app contradicts itself. */
  for (const p of refuseNeeds(spec.needs ?? {}, [])) {
    at(`need ${p.of}`, `${p.why}: ${p.detail}`);
  }

  /*
    ⚠️ AND HOW FAR A PERSON REACHES, WHICH FAILS OPEN IN EVERY DIRECTION. A
    collection that says where its records are, in a product that never declared
    what a place IS, reads as narrowed and is not; a `reachBy` naming a field
    that does not exist narrows by a column that is not there. Both compose,
    both serve, and both leave one site's stock readable from another.
  */
  for (const p of refuseReach(spec.reach, spec.collections)) {
    at(`reach ${p.of}`, p.why);
  }

  for (const id of unbounded(spec.meters ?? {})) {
    at(`meter ${id}`, "no output ceiling, so the reserve is a guess and the platform pays the difference");
  }

  /*
    ⚠️ AN AI ACTION IS REFUSED AT COMPOSITION FOR THE SAME REASON A METER IS
    (D19). A prompt naming a variable the action does not offer sends a literal
    brace to a model — invisibly, with a subtly wrong answer rather than a
    visible failure — and an action with no output ceiling reserves a guess,
    which the platform pays the difference on.
  */
  for (const o of spec.operations) {
    const ai = o.ai;
    if (!ai) continue;
    if (!(ai.maxOutput > 0)) {
      at(`operation ${o.id}`, "generates with no output ceiling, so the reserve is a guess");
    }
    for (const bad of unknownInPrompt(ai, ai.prompt)) {
      at(`operation ${o.id}`, `its prompt names "{${bad}}", which it does not declare`);
    }
    /* ⚠️ A variable nothing names is a value a caller must supply and nothing
       uses — the harmless direction, and still a promise the screen makes. */
    for (const unused of ai.variables.filter((v) => !ai.prompt.includes(`{${v}}`))) {
      at(`operation ${o.id}`, `declares "{${unused}}" and its prompt never names it`);
    }
    if (o.kind !== "write") {
      at(`operation ${o.id}`, "generates, which spends credits, and a read may not spend");
    }
  }

  /* --- the surface -------------------------------------------------------- */

  const primary = primaryOf(spec.screens);
  if (primary.length > PRIMARY_MAX) {
    at("nav", `${primary.length} primary destinations — the ceiling is ${PRIMARY_MAX} (D10)`);
  }
  /*
    ⚠️ THE FIRST DESTINATION IS HOME, AND HOME IS THE PRODUCT'S OWN ROOT. The
    bar's first item is where a thumb lands, where the address bar points at a
    cold start, and where "go back to the beginning" means — three things that
    have to be one place. An app whose first destination is anywhere but `/`
    opens on one screen and offers a different one as its first tap, which reads
    as the product having two beginnings.
  */
  if (primary.length && primary[0]!.route !== "/") {
    at("nav", `the first destination is "${primary[0]!.route}" — home is the app's own root`);
  }
  /*
    ⚠️ ONE SEARCH AND ONE ASSISTANT, because the chrome has one slot for each. A
    second is a declaration the surface silently drops — which is the shape where
    an app author is certain they shipped something and nobody can see it.
  */
  for (const role of ["search", "assistant"] as const) {
    const claimed = spec.screens.filter((s) => s.chrome === role);
    if (claimed.length > 1) {
      at("chrome", `${claimed.length} screens claim "${role}" — the chrome has one slot for it`);
    }
    /* ⚠️ AND IT IS NOT ALSO A DESTINATION — see `ScreenSpec.chrome`. */
    for (const s of claimed.filter((c) => c.nav === "primary")) {
      at("chrome", `"${s.id}" is the ${role} and a destination — the chrome already offers it`);
    }
  }

  const catalog: ProblemCatalog = { ...PLATFORM_PROBLEMS, ...(spec.problems ?? {}) };
  for (const code of redefined(spec.problems ?? {})) {
    at("problem", `"${code}" is the platform's and an app may not reword it`);
  }
  for (const o of spec.operations) {
    for (const code of unknownProblems(catalog, o.fails ?? [])) {
      at(`operation ${o.id}`, `says it can fail with "${code}", which no catalogue has`);
    }
  }

  /*
    ⚠️ A WAY BACK THAT WOULD FAIL ON THE ONE PRESS IT EXISTS FOR — see
    `Outcome.back`. Every fault here is invisible until somebody makes a mistake
    and reaches for the button, which is the worst possible moment to discover
    that its input never resolved: the reversal 400s, the confirmation is gone,
    and what is left on the shelf is whatever the mistake put there.

    ⚠️ AND THE ANSWER IS THE ONLY THING IT CAN READ, which is why `said` is
    checked against `output` rather than against anything on the screen. A write
    reversible from the browser has to HAND BACK the handle — `stock.receive`
    answers with the ledger row it wrote — and an operation that answers nothing
    cannot be taken back by a button no matter how the button is worded.
  */
  for (const o of spec.operations) {
    const said = o.outcome;
    const back = said && !isSilent(said) ? said.back : undefined;
    if (!back) continue;
    const where = `operation ${o.id}`;
    if (!back.says.trim()) {
      at(where, "offers a way back with no words on it — a control that says nothing "
        + "is one nobody knows the outcome of");
    }
    const undoes = spec.operations.find((x) => x.id === back.operation);
    if (!undoes) {
      at(where, `takes itself back with "${back.operation}", which this app does not `
        + "declare — a generated verb cannot reverse a write, because reversing one "
        + "is a rule rather than a shape");
      continue;
    }
    if (undoes.kind !== "write") {
      at(where, `takes itself back with ${undoes.id}, which is a ${undoes.kind} — `
        + "pressing it would report success and change nothing");
    }
    /* ⚠️ THE REVERSAL IS A DOOR OF ITS OWN, AND IT ANSWERS TO ITS OWN KEY. That
       is correct and it is also why this is only a warning-shaped check rather
       than a silent equality: a reversal MAY ask for more than the write did
       (an operator undoing a member's move), but one that asks for LESS would
       be a way around the gate the write itself stands behind. */
    if (o.permission !== PUBLIC && undoes.permission === PUBLIC) {
      at(where, `is gated on "${String(o.permission)}" and takes itself back with `
        + `${undoes.id}, which is public — the way back would be a door around the `
        + "one the write stands behind");
    }
    const takes = undoes.input ?? {};
    for (const name of Object.keys(back.from)) {
      if (name in takes) continue;
      at(where, `fills "${name}" on ${undoes.id}, which does not take it — `
        + `it takes ${Object.keys(takes).join(", ") || "nothing"}`);
    }
    for (const [name, wants] of Object.entries(takes)) {
      if (!wants.required || name in back.from) continue;
      at(where, `leaves "${name}" empty on ${undoes.id}, which requires it — the press `
        + "would be refused at the door for a value the screen was holding all along");
    }
    for (const [name, from] of Object.entries(back.from)) {
      if (from === "today") continue;
      if (from.said in (o.output ?? {})) continue;
      at(where, `fills "${name}" from "${from.said}", which it does not answer — `
        + `it answers ${Object.keys(o.output ?? {}).join(", ") || "nothing"}`);
    }
  }

  const screenKeys = new Set(permissions);
  for (const s of spec.screens) {
    if (!screenKeys.has(s.permission)) {
      at(`screen ${s.id}`, `needs "${s.permission}", which is not a declared permission`);
    }
  }

  /*
    ⚠️ THE BODIES LAST, BECAUSE EVERY REFUSAL IN THEM NAMES SOMETHING CHECKED
    ABOVE. A block bound to a field of a collection that does not compose is one
    fault reported twice, and the second report sends the reader to the screen
    rather than to the collection.
  */
  const views = spec.views ?? [];
  for (const v of views) {
    for (const p of refuseView(v, spec.collections)) at(p.of, `${p.why}: ${p.detail}`);
    /*
      ⚠️ THE THREE HALVES OF AN ASKED VIEW THAT NEED THE OPERATION ITSELF — see
      `AskedSpec`. Checked here for the same reason a `fills` is: `refuseView` is
      handed collections and nothing else, and the whole point of these is what an
      operation DECLARES.

      ⚠️ THE `read` ONE IS THE SHARP ONE. A body is drawn on arrival, so a write
      here fires on every navigation, on every re-read after an act, and twice in
      a browser that mounts a tree twice — an idempotency key would not save it,
      because each is a different request.
    */
    const asked = v.asked;
    if (!asked) continue;
    /*
      ⚠️ THE PLATFORM'S OWN READS COUNT TOO, AND THEY ARE NAMED HERE — see
      `SHARED_READS`. Every app gets them and none of them declares them, so a
      body asking for one was refused as naming an operation that does not exist
      — which pushed the one screen that wanted a total straight back into the
      three-lists-with-`limit:-1` shape the platform added `totals.read` to end.
    */
    const shared = SHARED_READS[asked.operation];
    if (shared) {
      if (!shared.includes(asked.take)) {
        at(`view ${v.id}`,
          `asked_take_unknown: takes "${asked.take}" off ${asked.operation}, which answers `
          + `${shared.join(", ")} — the view would be empty and the screen would say the `
          + "workspace is");
      }
      continue;
    }
    const op = spec.operations.find((o) => o.id === asked.operation);
    if (!op) {
      at(`view ${v.id}`,
        `asked_operation_unknown: is answered by "${asked.operation}", which this app `
        + "does not declare — a generated verb cannot answer a view, because what it "
        + "hands back is composed by the runtime rather than written down");
      continue;
    }
    if (op.kind !== "read") {
      at(`view ${v.id}`,
        `asked_not_a_read: is answered by ${op.id}, which is a ${op.kind} — a body is drawn `
        + "on arrival, so this would run every time somebody opened the screen");
    }
    if (!(asked.take in (op.output ?? {}))) {
      at(`view ${v.id}`,
        `asked_take_unknown: takes "${asked.take}" off ${op.id}, which answers `
        + `${Object.keys(op.output ?? {}).join(", ") || "nothing"} — the view would be empty `
        + "and the screen would say the workspace is");
    }
    /* ⚠️ THE SAME CHECK FOR THE COUNT, because a `total` naming nothing falls
       back to the page's own length — which is the exact wrong number this
       field exists to stop a list from reporting. */
    if (asked.total !== undefined && !(asked.total in (op.output ?? {}))) {
      at(`view ${v.id}`,
        `asked_take_unknown: counts by "${asked.total}", which ${op.id} does not answer — `
        + "the list would fall back to the length of the page it was handed and "
        + "report a bounded answer as the whole of it");
    }
  }
  /*
    ⚠️ THE GENERATED ONES COUNT, AND LEAVING THEM OUT REFUSED THE ORDINARY CASE.
    `supplier.create` is not written in any manifest — the runtime composes it
    from the collection — so a body offering it was refused as naming an
    operation the app does not declare, which is the one act every list screen
    has. `operationsFor` is the same derivation the runtime mounts from, so the
    two cannot disagree about which verbs a collection got.
  */
  const ops = [
    ...spec.operations.map((o) => o.id),
    ...spec.collections.flatMap(operationsFor),
  ];
  const screenIds = spec.screens.map((s) => s.id);
  for (const s of spec.screens) {
    for (const p of refuseSurface(s, BLOCKS, views, spec.collections, ops, screenIds, HEROES)) {
      at(p.of, `${p.why}: ${p.detail}`);
    }
    /*
      ⚠️ A FILL NAMING A FIELD THE OPERATION DOES NOT TAKE IS A VALUE THAT GOES
      NOWHERE — the door drops an input it never declared, so the act runs
      missing the thing the screen was supposed to supply and refuses with the
      field marked required and nothing in it. Checked here rather than in
      `refuseSurface` because this is the one place an operation's `input` is in
      scope: that function is handed ids alone.

      ⚠️ AND A GENERATED VERB IS NOT CHECKED, because its input is composed by
      the runtime from the collection's fields rather than written here. Filling
      one is legal and unverified; that is the honest state of it, and a fills on
      `note.update` is not a shape anything in this repository has wanted.
    */
    for (const [id, fills] of Object.entries(s.body ? fillsIn(s.body) : {})) {
      const takes = spec.operations.find((o) => o.id === id)?.input;
      for (const [name, from] of Object.entries(fills)) {
        if (takes && !(name in takes)) {
          at(`screen ${s.id}`,
            `fills_field_unknown: fills "${name}" for ${id}, which takes no such input — `
            + "the value would be dropped at the door and the act would refuse for want of it");
        }
        const source = fillOf(from);
        /* ⚠️ A LIST OF ONE INTO A FIELD THAT DOES NOT TAKE A LIST — see `Fill`.
           `each` says the input wants an array, and every other field kind in
           this vocabulary is a scalar the door validates as one: an array
           arriving at a `text` is refused as the wrong type, on a press, with
           the field marked and nothing a person can do about it. `json` is the
           only kind that holds one, so it is the only kind this may fill. */
        if (source.every && takes && takes[name] && takes[name].kind !== "json") {
          at(`screen ${s.id}`,
            `fill_each_not_a_list: fills "${name}" for ${id} with \`each\`, and that input `
            + `is \`${takes[name].kind}\` — the door takes a scalar there and would refuse `
            + "the one-element list the screen sends");
        }
        /* ⚠️ BOTH SOURCES THAT READ THE RECORD NEED ONE — see `Fill`. The id and
           a column on it are the same requirement: without `of` there is no row,
           and the value would arrive undefined at a required field. */
        if ((source.of === "record" || source.of === "field") && !s.of) {
          at(`screen ${s.id}`,
            `fill_without_a_subject: fills "${name}" from the record and names no \`of\` — `
            + "there is no record for it to be a value of");
        }
        /* ⚠️ AND A COLUMN THAT IS NOT THERE IS A FORM THAT REFUSES FOR WANT OF A
           FIELD IT NEVER DREW. Same class as `fills_field_unknown`, from the
           other end: the input is real and the value going into it is not. */
        if (source.of === "field" && s.of) {
          const held = spec.collections.find((c) => c.id === s.of)?.fields;
          if (held && !(source.field in held)) {
            at(`screen ${s.id}`,
              `fill_without_a_subject: fills "${name}" from "${source.field}", which `
              + `${s.of} does not have — the act would refuse for want of a value the `
              + "screen was supposed to know");
          }
        }
      }
    }
  }
  /*
    ⚠️ A FLOW AND A SESSION KEEP THEIR CONTROLS AND NOT THEIR CLAIMS. Both
    declare a shape and draw themselves — that is the bargain — and what the
    declaration buys is that the strings in it are checked. `StorySpec`'s own
    header has claimed since it was written that a guard proves `writes` is a
    real operation and that the screen's `permission` is the one that operation
    demands. Nothing did. A flow could take somebody through ten questions and be
    refused by the write at the end, which is the exact failure the paragraph
    describes and the exact failure nothing anywhere would have caught.

    ⚠️ AND THE PERMISSION IS THE SHARP ONE, because it fails LATE. An unknown
    operation id is a 404 on the first press; a permission that does not match is
    twenty minutes of work and a refusal at the write — and it looks like the
    platform being broken rather than the manifest disagreeing with itself.
  */
  for (const s of spec.screens) {
    const flows: readonly { readonly what: string; readonly writes: readonly string[] }[] = [
      ...(s.story ? [{ what: "story", writes: [s.story.writes] }] : []),
      ...(s.session ? [{ what: "session", writes: s.session.writes }] : []),
    ];
    for (const flow of flows) {
      if (!flow.writes.length) {
        at(`screen ${s.id}`,
          `${flow.what}_writes_nothing: declares a ${flow.what} that writes nothing — `
          + "a place somebody works and cannot record anything is a page, and it says so here");
      }
      for (const id of flow.writes) {
        const op = spec.operations.find((o) => o.id === id);
        if (!op) {
          at(`screen ${s.id}`,
            `${flow.what}_write_unknown: its ${flow.what} writes "${id}", which this app does `
            + "not declare — the flow would be refused at the press, by a 404");
          continue;
        }
        if (op.kind === "read") {
          at(`screen ${s.id}`,
            `${flow.what}_not_a_write: its ${flow.what} writes ${id}, which is a read — `
            + "nothing would be recorded and the screen would report success");
        }
      }
      /*
        ⚠️ THE PERMISSION RULE IS THE STORY'S ALONE, AND THE REASON IS WHAT A
        FLOW IS. A story exists to reach ONE write and ends there, so a screen
        offered on a grant that write does not demand takes somebody through ten
        questions and refuses them at the last press — which is the failure
        `StorySpec`'s own header describes and which nothing checked.

        ⚠️ A SESSION IS DELIBERATELY DIFFERENT AND BOTH REAL CASES PROVE IT.
        Scanning is a READING screen that can also teach a code, so it is offered
        on `product:read` and its one write asks for more; the label sheet is
        `location:read` because anybody may look at it and minting is what the
        writes behind it ask for. Applying the story's rule to a session would
        refuse both — correct declarations, refused for being generous.
      */
      const told = s.story;
      if (told) {
        const wants = String(spec.operations.find((o) => o.id === told.writes)?.permission ?? "");
        if (wants && wants !== s.permission) {
          at(`screen ${s.id}`,
            `story_permission_wrong: is offered on "${s.permission}" and writes ${told.writes}, `
            + `which demands "${wants}" — somebody would be taken through every question and `
            + "refused at the last press");
        }
        /*
          ⚠️ AND WHAT IT SHOWS BEFORE THE PRESS HAS TO BE REAL — see `ShowsSpec`.
          Every one of these fails at the review, on the one screen whose job is
          to let somebody decide, and every one of them fails QUIETLY: an unknown
          operation is a 404 the review has nothing to draw, an output field that
          is not there is a report of nothing, and a `with` naming no answer is a
          report computed over an empty input — which for an import reads as
          "nothing will happen" over a spreadsheet that is about to be applied.
        */
        const shows = told.shows;
        if (shows) {
          const by = spec.operations.find((o) => o.id === shows.by);
          if (!by) {
            at(`screen ${s.id}`,
              `story_shows_unknown: its story shows "${shows.by}", which this app does not `
              + "declare — the review would ask a 404 what the flow is about to do");
          } else if (!(shows.take in by.output)) {
            at(`screen ${s.id}`,
              `story_shows_nothing: shows ${shows.by} and takes "${shows.take}", which it does `
              + "not answer with — the review would draw an empty report over a press that "
              + "is about to happen");
          }
          /* ⚠️ THE SAME OPERATION FOR BOTH IS NOT A PREVIEW, IT IS THE WRITE
             RUNNING TWICE — and the first time is the one nobody asked for. */
          if (shows.by === told.writes) {
            at(`screen ${s.id}`,
              `story_shows_the_write: shows ${shows.by} and writes it too — a flow that runs `
              + "its own write to find out what it would do has already done it");
          }
          const takes = spec.operations.find((o) => o.id === told.writes)?.input ?? {};
          for (const [wants_, from] of Object.entries(shows.with)) {
            if (by && !(wants_ in by.input)) {
              at(`screen ${s.id}`,
                `story_shows_unknown_input: hands ${shows.by} a "${wants_}", which it does not `
                + "take — the value would be dropped at the door");
            }
            if (!(from in takes)) {
              at(`screen ${s.id}`,
                `story_shows_from_nothing: feeds ${shows.by}'s "${wants_}" from "${from}", which `
                + `${told.writes} does not take — so no step answers it and the report would be `
                + "worked out over nothing");
            }
          }
        }
      }
    }
    for (const kept of s.session?.keeps ?? []) {
      if (!kept.is.trim()) {
        at(`screen ${s.id}`,
          `session_kept_unsaid: keeps "${kept.id}" and does not say what it is — `
          + "the name of a variable is not a fact about the product");
      }
    }
    for (const p of refuseStory(
      s, spec.operations, ASKS, Object.keys(spec.settings ?? {}), screenIds,
    )) {
      at(p.of, `${p.why}: ${p.detail}`);
    }
  }

  for (const id of unreadViews(views, spec.screens.map((s) => s.body))) {
    at(`view ${id}`, "declared and read by no screen — a rule about this product's data that nothing honours");
  }

  for (const p of refuseGuide(
    spec.guide ?? {}, spec.milestones ?? {}, spec.help ?? {},
    events, routes, permissions, spec.screens.map((s) => s.id), eventsDone(spec),
  )) {
    at(`guide ${p.of}`, `${p.why}: ${p.detail}`);
  }

  return out;
}

/**
 * ⚠️ THE DOOR THROWS RATHER THAN RETURNS, because an app whose manifest is wrong
 * must not boot. Everything `refuseApp` finds is a fault that would otherwise be
 * discovered by a customer, so the deploy is the last place it can be cheap.
 */
export function defineApp(spec: AppSpec): AppSpec {
  const refusals = refuseApp(spec);
  if (refusals.length) {
    throw new Error(
      `${spec.id}: this manifest does not compose.\n` +
      refusals.map((r) => `  · ${r.of}: ${r.why}`).join("\n"),
    );
  }
  return spec;
}
