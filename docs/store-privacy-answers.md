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

**Does your app collect or share any of the required user data types?** → **Yes** (email only).

| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| Personal info → **Email address** | Yes | **No** | Account management | Required — an account cannot exist without it |
| Personal info → Name, address, phone, race, political views | No | No | — | — |
| Financial info | No | No | — | — |
| Location (precise or approximate) | **No** | No | — | — |
| Web browsing history, search history | No | No | — | — |
| App activity, app info, performance, diagnostics | **No** | No | — | — |
| Device or other IDs | **No** | No | — | — |

Answers to the remaining questions:

- **Is all user data encrypted in transit?** → Yes. HTTPS throughout.
- **Do you provide a way to request data deletion?** → Yes, both in-app and via the URL above.
- **Data collected for advertising or marketing?** → No. There is no advertising.
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

**Data not linked to you:** none.

Everything else — Health, Financial, Location, Contacts, User Content, Browsing History, Search
History, Identifiers, Usage Data, Diagnostics, Purchases, Sensitive Info — is **not collected**.

Apple also asks whether account creation is offered and whether deletion is possible in-app: yes
to both. The in-app path is Settings → Delete account, and it re-authenticates with the password.

## The inventory these answers come from

- **Stored per account:** email, bcrypt password hash, role, email-verified flag, optional TOTP
  secret and recovery codes.
- **Stored per session:** SHA-256 token hash, family id, expiry, revoked flag. **No IP address and
  no user-agent** are recorded against an account or a session.
- **Cookies:** one strictly-necessary `httpOnly` session cookie, 30 days.
- **Third-party code in the client:** none that phones home. No analytics, error-reporting,
  advertising or attribution SDKs.
- **Retention:** account data until the user deletes it; sessions ≤ 30 days; sign-in tokens
  15 minutes.
- **Deletion:** removes the user record, password hash, TOTP secret, recovery codes, all sessions
  and rate-limit counters; anonymises data-quality reports the user filed.

## Not covered by these forms

The ownership graph contains personal data about **third parties** taken from public registers —
company directors and people with significant control. Those people are not app users, so the
store forms have nothing to say about them. That processing is covered by
[Part 2 of the privacy policy](../public/legal/privacy.html) under GDPR Art. 14, and it is the
part a data protection authority would look at first. Do not let a clean store declaration create
the impression that the privacy question is settled.
