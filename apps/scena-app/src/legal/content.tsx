/**
 * Legal documents (§legal) — the Terms of Service and Privacy Policy, plus a
 * shared dialog to view them. Rendered as content (not a CMS) so they ship with
 * the app, are readable pre-auth (from the login screen), and version with the
 * code. Linked from the login screen, the account menu, and the billing page.
 *
 * NOTE: this is a solid starting draft tailored to what Scena actually does, but
 * it is not a substitute for legal advice — have counsel review before you rely
 * on it. The entity, address, jurisdiction and contact live in the `LEGAL`
 * object below (currently Four Degree Labs, Abu Dhabi, UAE).
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog.js";

/** Product + legal identifiers. Fill the bracketed fields for your entity. */
export const LEGAL = {
  service: "Scena",
  entity: "Four Degree Labs",
  address: "Abu Dhabi, United Arab Emirates",
  jurisdiction: "Abu Dhabi, United Arab Emirates",
  contact: "legal@4dl.app",
  privacyContact: "privacy@4dl.app",
  updated: "July 7, 2026",
};

export type LegalDoc = "terms" | "privacy";

/* ------------------------------- primitives ------------------------------- */

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-6 text-sm font-semibold text-foreground first:mt-0">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}
function L({ children }: { children: React.ReactNode }) {
  return <ul className="mb-3 ml-4 list-disc space-y-1 text-[13px] leading-relaxed text-muted-foreground marker:text-muted-foreground/50">{children}</ul>;
}
/* --------------------------------- terms ---------------------------------- */

export function TermsContent() {
  return (
    <div>
      <P>Last updated: {LEGAL.updated}. These Terms of Service (the “Terms”) are a binding agreement between you and {LEGAL.entity} (“{LEGAL.service}”, “we”, “us”) governing your access to and use of the {LEGAL.service} digital-signage platform, apps, players, and related services (together, the “Service”). By creating an account, signing in, or using the Service, you agree to these Terms. If you use the Service on behalf of an organization, you represent that you are authorized to bind it.</P>

      <H>1. The Service</H>
      <P>{LEGAL.service} lets you create, schedule, and display content on screens (“Players”) and run live operational boards (queues, rooms, scoreboards). It includes a content builder, a media library, AI-assisted generation of slides and layouts, data sources (feeds, weather), and analytics.</P>

      <H>2. Accounts and workspaces</H>
      <L>
        <li>A <b>workspace</b> is the organizational account under which screens, content, boards, staff, and billing live. The person who creates it is the “Owner”.</li>
        <li>Owners and platform administrators sign in with an emailed one-time code. Staff and board users (e.g. front desks, referees, door tablets) sign in with a username and password issued within a workspace.</li>
        <li>You are responsible for your credentials and for all activity under your account, and must keep them confidential. Tell us promptly of any unauthorized use.</li>
        <li>You must be at least 18 (or the age of majority where you live) and provide accurate information.</li>
      </L>

      <H>3. Plans, credits, and billing</H>
      <L>
        <li>The Service is offered on free and paid plans. Paid plans are billed in advance on a recurring basis (monthly or annual) through our payment processor, Stripe, and <b>renew automatically</b> until cancelled.</li>
        <li>AI generation (images, slides, layouts, voice, music) is metered in <b>credits</b>. Plans include a periodic credit grant; you can also buy one-time credit packs. Credits are consumed at the price of the model used at generation time.</li>
        <li>Plan grants reset each cycle and do not roll over; purchased pack credits do not expire while your account is active. Except where required by law, payments and credits are <b>non-refundable</b>.</li>
        <li>You can change or cancel your plan at any time; cancellation takes effect at the end of the current billing period. We may change prices with reasonable notice, effective on your next renewal.</li>
      </L>

      <H>4. Your content and rights clearance</H>
      <P>You retain ownership of the text, images, video, audio, and other materials you upload or create (“Your Content”). You grant us a worldwide, non-exclusive licence to host, store, process, transmit, adapt (e.g. transcode/resize), and display Your Content solely to operate and provide the Service, including showing it on your Players.</P>
      <L>
        <li>You are solely responsible for clearing all rights in anything you upload — images, video, fonts, and music (including audio inside a video) — for the public display and commercial use you make of it.</li>
        <li>Content you obtain from the {LEGAL.service} public/licensed library is licensed for your commercial use within the Service. Imagery and HTML generated by our AI features are licensed to you (see §5).</li>
        <li>You represent that Your Content, and its display on your screens, does not infringe any third party’s rights or violate any law.</li>
      </L>

      <H>5. AI features</H>
      <L>
        <li>AI features generate content from your prompts and brand kit using third-party AI providers. Output may be inaccurate, generic, or similar to output produced for others; <b>you are responsible for reviewing AI output before publishing it</b> to a screen.</li>
        <li>As between you and us, we assign to you our rights (if any) in the content our AI generates for you, and you may use it commercially within and outside the Service. You are responsible for ensuring your prompts and the resulting output are lawful and non-infringing.</li>
        <li>Do not use AI features to create unlawful, deceptive, or infringing content, or to attempt to reconstruct training data or provider models.</li>
      </L>

      <H>6. Acceptable use</H>
      <P>You agree not to, and not to allow anyone to:</P>
      <L>
        <li>use the Service for anything illegal, or to display content that is unlawful, defamatory, harassing, hateful, obscene, or that infringes intellectual-property, privacy, or publicity rights;</li>
        <li>upload malware, attempt to breach or probe security, disrupt the Service, or circumvent usage limits, metering, or access controls;</li>
        <li>resell or provide the Service to third parties except as expressly permitted, or misrepresent your affiliation;</li>
        <li>use the HTML/embed features to load unauthorized remote code or exfiltrate data.</li>
      </L>

      <H>7. Third-party services and data</H>
      <P>The Service integrates third parties, including Cloudflare (hosting, storage, edge AI), Google (Gemini and text-to-speech), and Stripe (payments), and can display third-party data you connect (RSS/news feeds, weather, spreadsheets). We are not responsible for third-party content or services, and your use of them may be subject to their terms.</P>

      <H>8. Availability</H>
      <P>Players are designed to run unattended and cache content, but the Service is provided on an “as available” basis. We do not guarantee uninterrupted or error-free operation, and may modify, suspend, or discontinue features. We are not liable for content shown (or not shown) on your screens due to connectivity, device, or configuration issues.</P>

      <H>9. Suspension and termination</H>
      <P>You may stop using the Service at any time. We may suspend or terminate access if you breach these Terms, fail to pay, or create risk or legal exposure for us or others. On termination, your right to use the Service ends and we may delete Your Content after a reasonable period (see the Privacy Policy for retention).</P>

      <H>10. Disclaimers</H>
      <P>Except as expressly stated, the Service and all content are provided “as is” and “as available” without warranties of any kind, whether express, implied, or statutory, including merchantability, fitness for a particular purpose, non-infringement, and any warranty regarding AI output, uptime, or results.</P>

      <H>11. Limitation of liability</H>
      <P>To the maximum extent permitted by law, we will not be liable for any indirect, incidental, special, consequential, or exemplary damages, or for lost profits, revenue, data, or goodwill. Our total liability for any claim relating to the Service will not exceed the greater of (a) the amounts you paid us for the Service in the 12 months before the claim, or (b) USD 100.</P>

      <H>12. Indemnification</H>
      <P>You will defend and indemnify us against claims, damages, and costs arising from Your Content, your use of the Service, or your breach of these Terms or of any law or third-party right.</P>

      <H>13. Changes</H>
      <P>We may update these Terms from time to time. If we make material changes, we will provide reasonable notice (e.g. in-app or by email). Your continued use after changes take effect constitutes acceptance.</P>

      <H>14. Governing law</H>
      <P>These Terms are governed by the laws of {LEGAL.jurisdiction}, without regard to its conflict-of-laws rules, and the courts located there will have exclusive jurisdiction, except where mandatory local law provides otherwise.</P>

      <H>15. Contact</H>
      <P>Questions about these Terms: {LEGAL.entity}, {LEGAL.address} — {LEGAL.contact}.</P>
    </div>
  );
}

/* -------------------------------- privacy --------------------------------- */

export function PrivacyContent() {
  return (
    <div>
      <P>Last updated: {LEGAL.updated}. This Privacy Policy explains how {LEGAL.entity} (“{LEGAL.service}”, “we”) collects, uses, and shares information when you use the {LEGAL.service} platform, apps, and players (the “Service”). For the workspaces you administer, you are the controller of the content and end-user data you put into the Service, and we act as your processor.</P>

      <H>1. Information we collect</H>
      <L>
        <li><b>Account & workspace data:</b> your email (for owners/admins), username and password hash (for staff and board users), workspace name, roles, and settings, including your brand kit (colours, fonts, uploaded logos).</li>
        <li><b>Content you create or upload:</b> slides, widget layouts, media (images, video, audio), boards, feeds/sources you connect, and AI prompts.</li>
        <li><b>Billing data:</b> plan, subscription status, credit balance, and transaction records. Card details are collected and processed by Stripe — we do not store full card numbers.</li>
        <li><b>Usage & device data:</b> logs, feature usage, generation history, and information about the screens/players you pair (name, status, connectivity) and the browser/session you sign in from.</li>
        <li><b>Support communications</b> you send us.</li>
      </L>

      <H>2. How we use information</H>
      <L>
        <li>to provide, operate, secure, and improve the Service, including displaying your content on your Players and running your boards;</li>
        <li>to authenticate you, meter and bill usage, and prevent fraud and abuse;</li>
        <li>to run AI generation you request (your prompt and brand kit are sent to the AI provider to produce the output you asked for);</li>
        <li>to provide support and send service and transactional messages (e.g. sign-in codes, billing notices);</li>
        <li>to comply with law and enforce our Terms.</li>
      </L>

      <H>3. Sub-processors and sharing</H>
      <P>We do not sell your personal information. We share it with service providers who process it on our behalf under contract, including:</P>
      <L>
        <li><b>Cloudflare</b> — hosting, database, media storage, and edge AI inference;</li>
        <li><b>Google</b> — generative AI (Gemini) and text-to-speech, when you use those features;</li>
        <li><b>Stripe</b> — payment processing;</li>
        <li>an <b>email delivery provider</b> — to send one-time codes and notifications.</li>
      </L>
      <P>We may also disclose information to comply with law, protect rights and safety, or in connection with a merger or acquisition. Data you choose to connect (feeds, weather, spreadsheets) is fetched from those third parties.</P>

      <H>4. AI processing</H>
      <P>When you use AI features, your prompt, selected options, and brand kit are transmitted to the relevant AI provider to generate the requested output. We ask providers not to use your inputs to train their models where such a setting is available; provider terms also apply.</P>

      <H>5. Cookies and sessions</H>
      <P>We use a small number of strictly necessary cookies to keep you signed in and to operate the Service securely. We do not use advertising cookies.</P>

      <H>6. Retention</H>
      <P>We keep account and content data for as long as your account is active and as needed to provide the Service. After you delete content or close your workspace, we delete or de-identify the associated data within a reasonable period, except where we must retain it (e.g. billing records) to comply with law.</P>

      <H>7. Security</H>
      <P>We use technical and organizational measures to protect information, including encryption in transit, hashed passwords, and access controls. No system is perfectly secure; you are responsible for keeping your credentials safe.</P>

      <H>8. International transfers</H>
      <P>The Service runs on globally distributed infrastructure, so your information may be processed in countries other than yours. Where required, we rely on appropriate safeguards for such transfers.</P>

      <H>9. Your rights</H>
      <P>Depending on where you live, you may have rights to access, correct, delete, export, or restrict the processing of your personal information, and to object or withdraw consent. To exercise them, contact us at {LEGAL.privacyContact}. If you are an end user of a workspace (e.g. staff or a board user), please contact that workspace’s administrator first.</P>

      <H>10. Children</H>
      <P>The Service is not directed to children under 16, and we do not knowingly collect their personal information.</P>

      <H>11. Changes</H>
      <P>We may update this Policy from time to time and will note the “last updated” date above; material changes will be communicated in-app or by email.</P>

      <H>12. Contact</H>
      <P>Privacy questions: {LEGAL.entity}, {LEGAL.address} — {LEGAL.privacyContact}.</P>
    </div>
  );
}

/* --------------------------------- dialog --------------------------------- */

/** A scrollable dialog showing the Terms or Privacy doc (mobile-friendly), with
 *  a header switch between the two so one entry point reaches both. */
export function LegalDialog({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const [active, setActive] = useState<LegalDoc>("terms");
  useEffect(() => { if (doc) setActive(doc); }, [doc]);
  const Tab = ({ id, label }: { id: LegalDoc; label: string }) => (
    <button type="button" onClick={() => setActive(id)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active === id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}>
      {label}
    </button>
  );
  return (
    <Dialog open={!!doc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] max-w-[min(760px,95vw)] flex-col overflow-hidden sm:max-w-[min(760px,95vw)]">
        <DialogHeader>
          <DialogTitle className="sr-only">Legal</DialogTitle>
          <div className="flex gap-1.5">
            <Tab id="terms" label="Terms of Service" />
            <Tab id="privacy" label="Privacy Policy" />
          </div>
        </DialogHeader>
        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          {active === "privacy" ? <PrivacyContent /> : <TermsContent />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Inline "Terms · Privacy" links that open the dialog. Provide an opener. */
export function LegalLinks({ onOpen, className }: { onOpen: (doc: LegalDoc) => void; className?: string }) {
  return (
    <span className={className}>
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onOpen("terms")}>Terms</button>
      {" · "}
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onOpen("privacy")}>Privacy Policy</button>
    </span>
  );
}
