# Releases and versions

**One product version for the API, the web app and the Android app**, in semantic
versioning (`major.minor.patch`), starting at `1.0.0`. The **git tag is the only place
the number lives** — `package.json` stays at `0.0.0` and nothing else in either repo
carries it, so the three numbers that used to disagree (API 0.1.0, web 0.2.0, Android
1.0) cannot drift apart again.

- **A release is a tag `vX.Y.Z` on `main`, with the same number in both repos**
  (`~/scripts/release.sh X.Y.Z` tags both after checking they are ready). Tagging
  triggers `.github/workflows/release.yml` here (the production web build, attached
  to a GitHub release with notes from the merged PRs) and in pamten-backend (the API
  image `ghcr.io/<owner>/pamten-backend:X.Y.Z`), plus `android.yml` (the APK).
  A tag that is not `vMAJOR.MINOR.PATCH`, or not on `main`, fails the workflows.
- **Everything else is a development build** and says so: `0.0.0-dev+<commit>` —
  Render's dev deploys, local builds, tests.
- **Where to see it:** Settings shows *Version X*; the page carries
  `<meta name="app-version" content="X">` (`curl -s <site> | grep app-version`);
  the API reports it on `/` and in `/docs`.
- **Android build number** (Play requires it to grow): `major·10000 + minor·100 + patch`,
  so minor and patch stay ≤ 99 — the build refuses otherwise instead of colliding.
- **`/v1` is not the product version.** The API path changes only when old clients
  would break; the minimum-app-version switch (`/app-version`) decides which shipped
  apps may still run.
- **Repository settings the release build needs** (Actions variables/secrets):
  `PROD_API_URL` (required — baked into the bundle), `FEEDBACK_EMAIL` (optional),
  secrets `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` (the build fails without them).
- The resolver is `scripts/app-version.mjs` (`--check`, `--code`), shared by Vite,
  the workflows and Gradle.

## Installed app: minimum version check

The Android app is a native shell that loads the deployed site, so its web code is
always current — what can go stale is the **shell** (plugins, WebView settings). At
start, and when it returns to the foreground (at most hourly), the app asks the
backend's unversioned `GET /app-version?platform=android&version=<installed>` and:

- **update required** → a full-screen *Update required* screen with no way past it
  (the backend only says this when that build must not keep running);
- **update available** → a banner with *Update* / *Later* (*Later* is remembered per
  offered version).

The server decides and the client fails open: no answer, a malformed answer, the web
app, and development builds (`0.0.0-dev…`) all mean "carry on". Only `https://`,
`market://` and `itms-apps://` store links are opened. Setting the policy is an admin
call on the backend (`PUT /app-version`, see its api-reference), e.g.:

```bash
curl -X PUT "$API/app-version" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"android": {"min_supported": "1.0.0", "latest": "1.1.0",
                   "store_url": "https://play.google.com/store/apps/details?id=org.owlgraph.app"}}'
```

It is a full replace per call — send every platform you want kept.
