# Working on this project

## Branch and worktree workflow — HARD RULE

**No direct commits to `main`.** All changes land via PR from a feature
branch + worktree. `main` is (or should be) protected; even the maintainer
goes through the PR flow.

For every change, create a worktree:

```sh
git worktree add ../<repo>+<feature-name> -b <feature-name>
cd ../<repo>+<feature-name>
# … work, commit, push the branch …
gh pr create --fill
```

When the PR merges, **clean up immediately** in the same shell session:

```sh
cd <main-worktree>
git pull --ff-only
git worktree remove ../<repo>+<feature-name>
git branch -d <feature-name>
git push origin :<feature-name>   # only if you pushed the branch
```

Dangling feature branches or stray worktrees are smells — start a new
worktree when you need one, don't accumulate them "just in case".

## Release flow

This repo uses [release-please](https://github.com/googleapis/release-please).

- Every push to `main` (necessarily via PR merge — see above) triggers the
  `Release Please` workflow.
- release-please keeps an open `chore(main): release vX.Y.Z` PR continuously
  up to date with the proposed next version and an auto-generated
  `CHANGELOG.md` derived from conventional-commit messages.
- That PR **auto-merges** once `test` is green (configured in
  `.github/workflows/auto-merge.yml`). You don't manually merge it.
- The release-please merge tags `vX.Y.Z`. The `release.yml` workflow fires
  on the tag → `build.yml` produces `dist/` → `gh-release` uploads to a
  GitHub release → `publish-aur` pushes the new PKGBUILD to AUR.

Effectively: every PR merge to `main` ships a release. There's no "save up
a few commits then release" intermediate state — `main` is always shipped.

### Version bump rules (conventional commits)

| commit type | bump | shown in CHANGELOG |
|---|---|---|
| `feat:` | minor (0.X.0) | yes |
| `fix:` | patch (0.0.X) | yes |
| `feat!:` or `BREAKING CHANGE:` in body | major (X.0.0) | yes |
| `docs:`, `refactor:`, `perf:`, `revert:` | none | yes |
| `chore:`, `ci:`, `build:`, `test:` | none | hidden |

## Test-driven changes — HARD RULE

**Every fix or feature PR must include a test that would fail without the
code change.**

Auto-merge is enabled on every non-draft PR (`.github/workflows/auto-merge.yml`);
it fires the moment the `test` status check is green. Without TDD, a PR can
land before any test captures the bug behavior — which means future
regressions slip in silently. TDD is what closes that loop.

The workflow:

1. **Write the failing test first**, against the broken state. Run your
   test command. Confirm it fails — and that the failure message points
   at the bug, not an unrelated assertion.
2. **Write the minimum code to make it pass.** Re-run. Confirm green.
3. **Sanity check** before pushing: stash your code change, re-run the
   test, watch it fail. Pop the stash, re-run, watch it pass. If the test
   passes both ways, the test isn't actually catching what you fixed —
   rewrite it.

```sh
git stash --keep-index -- <your-code-files>
<test command>    # the new test should FAIL here
git stash pop
<test command>    # and pass here
```

When TDD is impractical, prefix the commit explicitly to opt out:

- `docs:` — markdown / comments / inline docstrings, no behavior change
- `ci:` / `build:` — workflows, packaging that aren't unit-testable
- `refactor:` — pure restructuring with no observable behavior change
  (the existing test suite is your safety net)

For `feat:`, `fix:`, `perf:` — TDD is non-negotiable. PR description
should call out which test would have failed pre-fix.

## Commit conventions

- **Format:** `<type>(<scope>): <subject>` per
  [conventional commits](https://www.conventionalcommits.org/). Subject
  under ~70 chars; body explains the *why*.
- **No `--no-verify`** to bypass pre-commit hooks. If a hook fails,
  investigate and fix the underlying issue.
