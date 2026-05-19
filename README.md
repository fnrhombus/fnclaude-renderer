# aur-template

A GitHub template for projects that publish to:

- **GitHub releases** — versioned binaries / archives, attached to a tag
- **The Arch User Repository** — `<project>-bin` PKGBUILD, pushed
  automatically on every tagged release

The publishing chain is **language-agnostic**. The build step lives in a
reusable workflow (`build.yml`) that you fill in for your language; the
publish step doesn't care what produced the artifacts as long as they match
the documented contract.

## What you get

Out of the box:

- `release-please` PR that opens automatically on every push to `main`, keeps
  itself up to date based on conventional-commit messages, and auto-merges
  once `test` is green.
- On the merged release PR's tag push: cross-platform build (your code) →
  GitHub release with artifacts → AUR PKGBUILD push (binary package).
- `auto-merge.yml` that enables auto-merge on every non-draft PR, so the
  release chain closes without human intervention.
- Conventional-commits → semver bump, with rules documented in `CLAUDE.md`.

## Use it

1. Click **Use this template** on GitHub (or `gh repo create
   <new-name> --template fnrhombus/aur-template --public`).
2. Follow `BURN-AFTER-READING.md` for the one-time setup (secrets, repo
   settings, AUR account / key, customizing placeholders).
3. Fill in `.github/workflows/build.yml` and `.github/workflows/test.yml`.
4. Commit a `feat:` change. The first release ships itself.

## The contract between publish and build

`release.yml` (publish, agnostic) calls `build.yml` (you fill in) as a
reusable workflow when a tag is pushed. The contract:

**Inputs to `build.yml`:**

- `version` (string) — the pushed tag, e.g. `v1.2.3`.

**Outputs (via workflow artifact upload):**

- A single artifact named `dist` containing:
  - Per-platform archives — names matching the `source_*` URLs in
    `packaging/aur/PKGBUILD`. Conventional pattern:
    `<project>_Linux_x86_64.tar.gz`, `<project>_Linux_arm64.tar.gz`,
    `<project>_Darwin_x86_64.tar.gz`, `<project>_Windows_x86_64.zip`, etc.
  - `checksums.txt` — sha256 sums in standard `sha256sum` format
    (`<hash>  <filename>` per line).

That's the entire contract. As long as `build.yml` produces this artifact,
the publish chain works regardless of what language wrote the code.

## Worked examples

**Go (with goreleaser):**

```yaml
# .github/workflows/build.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-go@v5
        with: { go-version-file: go.mod, cache: true }
      - uses: goreleaser/goreleaser-action@v6
        with:
          distribution: goreleaser
          version: "~> v2"
          args: release --clean --skip=publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

**Rust (cargo-dist, single-platform shown):**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo build --release
      - run: |
          mkdir -p dist
          tar czf dist/<project>_Linux_x86_64.tar.gz -C target/release <project>
          (cd dist && sha256sum *.tar.gz > checksums.txt)
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

## Workflow files

| File | Role | Language-agnostic? |
|---|---|---|
| `release-please.yml` | Opens / maintains the release PR on every push to `main` | ✅ |
| `release.yml` | Orchestrator: build → GitHub release → AUR push, on tag | ✅ (orchestrator only) |
| `build.yml` | **You fill this in.** Produces `dist/` artifact | ❌ (language-specific) |
| `test.yml` | **You fill this in.** Produces the `test` status check | ❌ (language-specific) |
| `auto-merge.yml` | Enables auto-merge on non-draft PRs | ✅ |

## See also

- `BURN-AFTER-READING.md` — one-time setup checklist (delete after running)
- `CLAUDE.md` — conventions / discipline (branch policy, TDD, commit
  conventions)
- `packaging/aur/PKGBUILD` — your AUR package definition
- `release-please-config.json` — conventional-commits → version bump rules
