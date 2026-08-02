import type { AuthUser } from '../types'

// Who may trigger on-demand scraping: any signed-in, email-verified user (no role
// requirement). `email_verified` is undefined only for tokens issued before the field
// existed — treat undefined as "not yet known" and deny, so it self-heals on next login.
export function canScrape(user: AuthUser | null | undefined): boolean {
  return !!user && user.email_verified === true
}
