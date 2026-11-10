# Development

The branch rules GitHub enforces and how security updates arrive. The branch flow itself is in the [README](../README.md).

## Branch protection

A repository ruleset protects both branches, requiring `Test & Build` on each. `develop` requires a pull request (no approving review, so a solo maintainer can self-merge) and rejects direct pushes. `main` takes no pull request — that's what allows the fast-forward push, since GitHub's merge button can't do one — but a push is accepted only if that exact commit already passed CI on `develop`; anything unverified is rejected. Neither branch has bypass actors, and force-pushes are blocked on both; `develop` lets an admin force-merge a red PR when a dev-only experiment warrants it. CI runs on pushes and PRs to both branches.

Keep the two repos in step — a frontend change that needs a backend change should reach `main` in the same promotion round, since both deploy from the same branch names.

## Security updates

**Security updates** (since 2026-10-24). The CI job `Dependency audit` runs `npm audit` on every push and PR: production dependencies at high or critical fail the job (that is what ships — the web bundle and the Android app), the dev tree (vite, vitest, the Capacitor CLI) only warns, since those advisories are frequent and reach no user. It is not a required check, so an advisory without a fixed release does not block unrelated work. Dependabot opens a PR against `develop` for a locked package with a known vulnerability (`.github/dependabot.yml`: security updates only, no version-bump PRs). To clear a finding by hand run `npm audit fix` — with a current npm (`npx -y npm@latest audit fix`) if the installed one crashes in its peer resolver, and never with `--legacy-peer-deps`, which drops peer packages such as `@testing-library/dom` from the lock. When the only fix `npm audit` offers is a breaking change to the package that pulls the vulnerable one in, pin the patched version under that package in `overrides` instead — e.g. `"xcode": { "uuid": "^11.1.1" }` (2026-10-27, GHSA-w5hq-g745-h8pq: the Capacitor CLI's `xcode@3` locks `uuid@7`, and the offered fix was a CLI downgrade; `xcode` only calls `uuid.v4()`, which 11 still exports for `require`).
