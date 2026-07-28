# Kova — Privacy Policy


**Effective date:** 26 July 2026
**Last updated:** 26 July 2026

## 1. Introduction

This Privacy Policy explains how **Four Degree Labs LLC** ("**we**", "**us**",
"**our**"), a limited liability company licensed in mainland Abu Dhabi, United Arab
Emirates, and the operator of the **Kova** platform ("**Platform**"), collects,
uses, shares, and protects personal data. It applies to the Platform at
`kova.4dl.app`, any Studio custom domains, our marketing site, and related
services.

Kova is a multi-tenant platform for personal-training businesses. Because of this,
we act in two different capacities:

- **As a data controller** — for the personal data we collect to run, secure, and
  improve the Platform: account and authentication data, billing data, and usage and
  device data.
- **As a data processor** — for the personal data a **Studio** (a gym, studio, or
  coach that subscribes to Kova) submits or generates about its **Clients** and
  **Staff**. In that case, the **Studio is the controller** and decides why and how
  that data is used; we process it on the Studio's behalf and under its
  instructions. If you are a Client, your primary point of contact for your rights
  is the Studio that coaches you, though you may also contact us (see §14).

If you do not agree with this policy, do not use the Platform.

## 2. Definitions

Capitalised terms not defined here have the meaning given in our Terms of Service.
"**Personal data**", "**sensitive personal data**", "**processing**",
"**controller**", "**processor**", and "**data subject**" have the meanings given in
the PDPL.

## 3. The personal data we collect

**a. Account & authentication data.** Your name, email address, role, the Studio you
belong to, and authentication material. **Kova is passwordless** — we do **not**
store passwords. We store one-time email codes for a short period and, if you enrol
one, passkey (WebAuthn) public-key credentials and related metadata (device type,
credential identifiers). We do not receive your device's biometric data; that stays
on your device.

**b. Studio & billing data.** For Studios: business name, branding assets, plan and
subscription status, AI-credit balance and usage, invoices, and payment metadata.
**Card and bank details are collected and stored by our payment processor, Stripe —
we do not store full card numbers.**

**c. Client profile & coaching data** (Studio is controller). Where a Studio manages
Clients, this may include a Client's name, contact details, date of birth, gender,
photo/avatar, and coaching profile (goals, intake questionnaire, activity level,
preferences, units).

**d. Health & fitness data — sensitive personal data** (Studio is controller). The
Platform is designed to record fitness and wellbeing information, which may include:
body measurements and weight; body-fat and body-composition estimates; camera
body-scan data (see §8); blood type and, where a Client provides them, lab-test
results and uploaded lab documents; supplements; nutrition and food logs; workout
and activity logs; hydration, sleep, mood, energy, stress, and fasting logs;
check-ins, notes, and progress photos. **This is sensitive personal data under the
PDPL and is processed only on the basis of the data subject's explicit consent,
obtained by the Studio** (see §5 and §7).

**e. Communications.** Notifications we send (email and in-app), and messages or
support requests you send us.

**f. Usage, device & log data** (Kova is controller). Information generated when you
use the Platform: IP address, device and browser type, pages and features used,
timestamps, diagnostic and error logs, and information from our bot-protection
(Cloudflare Turnstile) used to tell humans from automated abuse.

We do not knowingly collect more sensitive data than the features a Studio chooses to
use require.

## 4. How we collect personal data

- **Directly from you** — when you register, configure a Studio, invite Staff, or use
  features.
- **From your Studio** — if you are a Client or Staff member, the Studio and its
  coaches enter or generate data about you.
- **Automatically** — usage, device, and log data as you interact with the Platform.
- **From our processors** — for example billing status from Stripe.

## 5. Lawful basis for processing (PDPL)

We (or, for Client/Staff data, the Studio) rely on one or more of the following legal
bases:

- **Consent** — including the **explicit consent** required for sensitive health and
  fitness data. A Client's explicit consent to health-data processing is obtained by
  the Studio; consent may be withdrawn at any time (withdrawal does not affect prior
  lawful processing).
- **Performance of a contract** — to provide the Platform to a Studio and its Users.
- **Legitimate interests / legal obligation** — to secure the Platform, prevent fraud
  and abuse, keep records, and comply with law, balanced against your rights.

## 6. How we use personal data

We use personal data to:

- provide, operate, and maintain the Platform and its features;
- authenticate you (passwordless sign-in) and keep accounts secure;
- process subscriptions, AI-credit purchases, and invoices (via Stripe);
- generate the coaching features a Studio uses, including plans, logs, progress
  analytics, and notifications;
- provide AI-assisted features (see §7);
- protect the Platform against fraud, abuse, and security threats;
- respond to support requests and communicate service and legal notices;
- comply with legal obligations and enforce our Terms.

We do **not** sell personal data. We do **not** use Client health and fitness data
for advertising.

## 7. AI processing

Some features use machine-learning models to assist coaching, including plan
drafting, food parsing, meal-photo analysis ("Snap-a-Meal"), nutrition-label reading,
camera body-composition estimates, check-in summaries, and coaching notes.

- AI features run on our cloud infrastructure provider's AI service and, for image /
  vision features, on a third-party vision provider (currently **Google (Gemini)** —
  see the sub-processor list in §9). Only the data needed for the specific feature is
  sent (for example, an uploaded photo and relevant context).
- **We do not use your Customer Data to train third-party foundation models**, and we
  contractually require our AI providers not to use data we send them to train their
  general-purpose models.
- AI outputs are estimates and drafting aids, not medical advice or diagnosis (see
  the Terms, "Health, fitness, and medical disclaimer").

## 8. Camera body-scan data

The optional body-scan feature estimates body composition from photos a Client
captures. Where a Studio and Client use it:

- A captured photo is processed only to compute the estimate and its confidence, and
  **the original photo is not stored** — it is discarded after processing.
- The only thing retained is a set of **de-identified body outlines (contours)**, and
  only **with the Client's consent**, to render progress visualisations. Without
  consent, nothing from the scan image is retained beyond the numeric estimate the
  Studio saves as a measurement.

Because body-scan data is sensitive, it is processed only on the Client's explicit
consent obtained by the Studio, and a Client may withdraw consent and request
deletion of the retained contours (see §14).

## 9. How we share data and our sub-processors

We share personal data only as needed to run the Platform and as described here:

- **With your Studio** — Clients' and Staff data is accessible to the Studio and the
  coaches assigned to that Client, under the Platform's role-based access controls.
- **With service providers (sub-processors)** who process data on our behalf under
  contract and appropriate safeguards. Our current sub-processors include:

  | Sub-processor | Purpose | Notes |
  |---|---|---|
  | **Cloudflare, Inc.** | Cloud hosting, database, object storage, edge delivery, bot-protection, platform AI, and transactional email (sign-in codes, notifications, digests) sent from our platform address via the Cloudflare Email Service | Data hosted on Cloudflare's global network |
  | **Stripe** | Payment processing (subscriptions, AI credits) and Studio Client payments via Stripe Connect | Card/bank data held by Stripe |
  | **Google (Gemini)** | AI vision features (body scan, meal photo, label reading) | Receives only the image and context needed |

  A Studio may optionally connect its **own** third-party email provider to send
  messages from its own address (rather than through our platform sender). In that
  case the Studio chooses and controls that provider, and it acts as the Studio's
  sub-processor, not ours.

  `[Keep this list current — the PDPL and good practice require you to maintain an
  accurate sub-processor list.]`

- **For legal reasons** — to comply with law, a lawful request from a competent
  authority, or to protect the rights, safety, or property of Four Degree Labs, our
  users, or the public.
- **In a business transfer** — in connection with a merger, acquisition, or sale of
  assets, subject to this policy.

## 10. International transfers

We and our sub-processors operate globally, so personal data may be processed outside
the United Arab Emirates. Where we transfer personal data across borders, we do so in
accordance with the PDPL's cross-border transfer requirements — to jurisdictions with
an adequate level of protection or, where none applies, under appropriate safeguards
(such as contractual clauses) or another lawful basis, including your consent, in
line with the UAE Data Office's requirements.

## 11. Data retention

We keep personal data for as long as needed to provide the Platform and for the
purposes described here:

- **Account & Studio data** — for the life of the account.
- **Customer Data (Client/Staff)** — for as long as the Studio maintains it; after a
  Studio closes its account or a Client is deleted, we delete or de-identify the data
  within 90 days.
- **Billing records** — retained as required by applicable UAE tax and accounting law.
- **Logs and security data** — retained for a limited period for security and
  diagnostics.

We may retain limited data longer where required to comply with law, resolve
disputes, or enforce our agreements.

## 12. Security

We use technical and organisational measures appropriate to the risk, including:
passwordless authentication (email one-time codes and passkeys, so there are no
stored passwords to breach); encryption in transit; role-based, row-level access
controls that scope each coach to their assigned Clients; tenant isolation; and
bot-protection. No system is perfectly secure; we cannot guarantee absolute security.
If a personal-data breach occurs, we will act in accordance with our obligations
under the PDPL, including notifying the UAE Data Office and affected data subjects /
controllers where required.

## 13. Children

The Platform is not directed to children under 17. A Studio must not create a
Client record for a minor without the verifiable consent of a parent or legal
guardian, and is responsible for obtaining it. If you believe we hold a child's data
without appropriate consent, contact us and we will address it.

## 14. Your rights

Subject to the PDPL and applicable law, you have the right to: access your personal
data; have inaccurate data corrected; request erasure; restrict or object to certain
processing; request portability of data you provided; and withdraw consent where
processing is based on consent. You will not be subjected to a decision based solely
on automated processing that produces legal or similarly significant effects without
appropriate safeguards.

- **If you are a Client or Staff member of a Studio**, that Studio is the controller
  of your coaching data — direct your request to the Studio in the first instance. We
  will assist the Studio in responding as its processor.
- **For data where Kova is the controller** (account, billing, usage), contact us at
  `info@fourdegreelabs.com`. We may need to verify your identity, and we will respond within
  the timeframe required by law.

You also have the right to lodge a complaint with the **UAE Data Office**, the
competent supervisory authority under the PDPL.

## 15. Cookies and similar technologies

The Platform uses only the cookies and local storage needed to sign you in, keep your
session, remember preferences, and protect against automated abuse (Turnstile). We do
not use third-party advertising or cross-site tracking cookies. `[If your marketing
site adds analytics, disclose it here and provide any required consent mechanism.]`

## 16. Changes to this policy

We may update this policy. If we make material changes, we will provide notice (for
example by email or in-app) before they take effect. The "Last updated" date shows
the latest version.

## 17. Contact us

**Four Degree Labs LLC**
`[Registered address, Abu Dhabi, United Arab Emirates]`
Privacy / data-protection enquiries: `info@fourdegreelabs.com`
`[Data Protection Officer / contact, if appointed: name + email]`
