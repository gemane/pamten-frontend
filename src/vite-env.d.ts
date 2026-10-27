/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `development` on the dev deploy only: shows the dev banner (src/devSite.ts). */
  readonly VITE_DEPLOY_ENV?: string
}

declare module 'react-simple-maps'

/** The product version, from the release tag — `1.2.3`, or `0.0.0-dev+<commit>` (scripts/app-version.mjs). */
declare const __APP_VERSION__: string
