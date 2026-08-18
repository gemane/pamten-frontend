# App-store privacy declarations

Prepared answers for the Google Play **Data safety** form and the Apple **App Privacy**
("nutrition label") questionnaire. Both forms ask the same questions in different words, so they
are answered here from one inventory — which is also the point of this file: when the data model
changes, this and `/legal/privacy.html` must change together, and keeping them side by side is
what stops them drifting apart.

Everything below was read out of the code, not assumed. Re-verify before each submission.

## URLs the forms ask for

| Field | Value |
|---|---|
| Privacy policy | `https://<domain>/legal/privacy.html` |
| Account deletion (Play, required) | `https://<domain>/legal/delete-account.html` |
| Support / contact | the address published in `/legal/imprint.html` |

Both are static files, reachable signed-out and without the app installed — which is exactly what
Google's deletion-URL rule requires.

## Google Play — Data safety

**Does your app collect or share any of the required user data types?** → **Yes** (an email
address, and aggregate app activity).

| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| Personal info → **Email address** | Yes | **No** | Account management | Required — an account cannot exist without it |
| Personal info → Name, address, phone, race, political views | No | No | — | — |
| Financial info | No | No | — | — |
| Location (precise or approximate) | **No** | No | — | — |
| App activity → **In-app search history** | **Yes** | **No** | Analytics — deciding which company registers to add next | Optional |
| App activity → **App interactions** | **Yes** | **No** | Analytics — which features are worth keeping | Optional |
| App activity → Installed apps, other user-generated content | No | No | — | — |
| Web browsing history | **No** | No | — | — |
| App info and performance (crash logs, diagnostics) | **No** | No | — | — |
| Device or other IDs | **No** | No | — | — |

⚠️ **The two "Yes" rows are declared on purpose, and Play arguably does not require them.** Play
excludes data that is aggregated so it cannot be linked to a person, and ours qualifies: no user
id, no session id, no device id, no IP, no per-event timestamp — running totals and nothing else.
Leaning on that exclusion is a judgement call about our own product, made by us, in our favour.
Declaring instead costs a line in a form and cannot be wrong. Do not "simplify" these back to No
without a lawyer saying so in writing.

Answers to the remaining questions:

- **Is all user data encrypted in transit?** → Yes. HTTPS throughout.
- **Do you provide a way to request data deletion?** → Yes, both in-app and via the URL above.
- **Data collected for advertising or marketing?** → No. There is no advertising, and no data is
  used for it.
- **Is the app-activity data processed ephemerally?** → No. It is kept as running totals and
  deleted once a row has been untouched for 12 months.
- **Data shared with third parties?** → No. The email address is *processed* by our email
  provider to deliver account emails, which the form counts as processing rather than sharing.
- **Is the app committed to Play's Families policy / does it target children?** → No.

⚠️ **Location is "No" and that is correct.** The app shows a world map, but it geocodes
*companies' registered offices* from public registers. It never requests, receives or infers the
device's location, and no location permission is declared.

## Apple — App Privacy

**Data used to track you across apps and websites:** none. No tracking, no ad identifiers, no
third-party analytics SDKs.

**Data linked to you:**

| Category | Type | Purpose |
|---|---|---|
| Contact Info | Email Address | App Functionality (account creation, sign-in, password reset) |

**Data not linked to you:**

| Category | Type | Purpose |
|---|---|---|
| Search History | Search History | Analytics — what people look for, so the roadmap follows demand |
| Usage Data | Product Interaction | Analytics — which features are used |

"Not linked" is the accurate answer and not a convenient one: the counters carry no user id, no
session id, no device identifier and no IP address, so there is nothing on the row to link them
*to*. Apple's definition is about whether the data is associated with an identity, not about
whether it is collected.

Everything else — Health, Financial, Location, Contacts, User Content, Browsing History,
Identifiers, Diagnostics, Purchases, Sensitive Info — is **not collected**.

Apple also asks whether account creation is offered and whether deletion is possible in-app: yes
to both. The in-app path is Settings → Delete account, and it re-authenticates with the password.

## The inventory these answers come from

- **Stored per account:** email, bcrypt password hash, role, email-verified flag, optional TOTP
  secret and recovery codes.
- **Stored per session:** SHA-256 token hash, family id, expiry, revoked flag. **No IP address and
  no user-agent** are recorded against an account or a session.
- **Cookies:** one strictly-necessary `httpOnly` session cookie, 30 days.
- **Stored as usage totals, tied to nobody:** counts per normalised search query + country
  (searched, found nothing, result taken), per named interaction, and per route template with a
  latency band. No user id, session id, IP address, device identifier, user agent, or per-event
  timestamp — there is no event log, only totals, so no individual's activity can be
  reconstructed. The query column is free text and can contain a person's name; see Activity 3 of
  the record of processing.
- **Third-party code in the client:** none that phones home. No error-reporting, advertising or
  attribution SDKs, and **no analytics SDK** — the counting above is first-party, into our own
  database, and reaches no other company.
- **Retention:** account data until the user deletes it; sessions ≤ 30 days; sign-in tokens
  15 minutes; usage totals deleted once untouched for 12 months (`manage.py prune-analytics`).
- **Deletion:** removes the user record, password hash, TOTP secret, recovery codes, all sessions
  and rate-limit counters; anonymises data-quality reports the user filed.

## Not covered by these forms

The ownership graph contains personal data about **third parties** taken from public registers —
company directors and people with significant control. Those people are not app users, so the
store forms have nothing to say about them. That processing is covered by
[Part 2 of the privacy policy](../public/legal/privacy.html) under GDPR Art. 14, and it is the
part a data protection authority would look at first. Do not let a clean store declaration create
the impression that the privacy question is settled.
