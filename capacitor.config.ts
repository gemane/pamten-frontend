import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration for the Android build.
 *
 * The app loads the **deployed site** rather than assets bundled into the APK.
 * That is a deliberate first step, not a shortcut, and the reason is the session:
 * the refresh token is an httpOnly cookie with `SameSite=Lax`, which the browser
 * only sends when the page and the API share a registrable domain. Bundled assets
 * would run on `https://localhost`, making every API call cross-site — you would
 * sign in successfully and be silently signed out fifteen minutes later when the
 * refresh failed. `CORS_ORIGINS` would reject the calls outright first.
 *
 * Pointing the webview at owlgraph.org keeps the origin identical to the browser's,
 * so cookies, CORS and auth behave exactly as they already do, with **no backend
 * change**. It also means the app picks up every frontend deploy without
 * reinstalling — useful while this is a personal test build.
 *
 * The cost is honest: it needs a network connection and does nothing offline. A
 * bundled build is the proper end state, and it needs the auth model changed first
 * — a refresh token returned in the response body and held in Android's secure
 * storage, rather than a cross-site cookie.
 *
 * Override the target with CAP_SERVER_URL when syncing, e.g. to point a build at
 * production later:
 *
 *   CAP_SERVER_URL=https://owlgraph.org npx cap sync android
 */
const serverUrl = process.env.CAP_SERVER_URL || 'https://dev.owlgraph.org'

const config: CapacitorConfig = {
  appId: 'org.owlgraph.app',
  appName: 'Owlgraph',
  // Required by the tooling even though the running app loads `server.url`.
  // `npx cap sync` copies it, and it is what a future bundled build would use.
  webDir: 'dist',
  server: {
    url: serverUrl,
    // HTTPS only. Cleartext would let a hostile network rewrite the app itself,
    // which for a webview that loads its whole UI remotely is total compromise.
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
