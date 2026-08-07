import type { AuthUser } from '../types'

// Who may trigger on-demand scraping: any signed-in, email-verified user (no role
// requirement). `email_verified` is undefined only for tokens issued before the field
// existed — treat undefined as "not yet known" and deny, so it self-heals on next login.
export function canScrape(user: AuthUser | null | undefined): boolean {
  return !!user && user.email_verified === true
}

// The scraper panel is graduated: each section appears only for roles the API
// would actually let act on it. The two predicates below mirror the backend's
// guards, and must be kept in step with them — a UI that offers an action the
// API refuses is worse than hiding it, because the user gets a 403 with no way
// to understand why.
//
// Not covered here, deliberately: the status header and the recent-activity feed
// are public (`/scraper/status` and `/scraper/runs` need no auth), so they render
// for everyone and need no predicate.

// Bulk runs, the source selector, per-source toggles, and duplicate-person
// review. Mirrors `require_contributor` on /scraper/run, /scraper/source/*/run
// and the /persons/* dedup endpoints.
export function canManageScrapes(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin' || user?.role === 'contributor'
}

// Federation and the bulk-dataset notes. The federation panel exists to add,
// remove and pull peers — all `require_admin` — so although reading peers is
// merely `require_contributor`, showing a contributor a panel whose every button
// 403s would be a worse experience than not showing it.
export function canAdministerScrapes(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin'
}
