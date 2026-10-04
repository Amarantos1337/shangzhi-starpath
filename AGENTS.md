# Repository Guidelines

## Project Structure & Module Organization

商职星途 is a Chinese-language alumni explorer and growth planner using plain HTML, CSS, and JavaScript.

- `project/index.html`: entry point, shared navigation, and dialog containers.
- `project/css/styles.css`: design tokens, component styles, and responsive layouts.
- `project/js/data.js`: alumni records, source references, and growth templates.
- `project/js/storage.js`: localStorage persistence, validation, and plan mutations.
- `project/js/app.js`: hash routing, page rendering, and interaction handlers.
- `project/assets/`: local illustrations, official logo, and alumni photographs.
- `比赛网址.txt`: competition reference URL.

No website package manifest or build step is required. Optional development tools live in `tools/`; cloud setup is documented in `docs/codex-cloud.md`.

## Build, Test, and Development Commands

Open `project/index.html` directly; no installation or build is required. Run optional preview and syntax checks from the repository root:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory project
node --check project/js/data.js
node --check project/js/storage.js
node --check project/js/app.js
```

The server previews the site at `http://127.0.0.1:8765/`. Node commands check syntax only. Keep direct-file operation working: use relative asset paths and classic scripts loaded in data → storage → app order. Avoid runtime fetches, ES modules, CDNs, and CodeArts dependencies.

### Codex Cloud / Linux

- Use Node.js 22+ (24 LTS recommended) and Python 3.9+. Run commands from the repository root; never rely on Windows drive paths or PowerShell in cloud tasks.
- Setup: `bash tools/codex-setup.sh`; add `--browser` to install optional Playwright/Chromium and system dependencies during environment preparation.
- Check: `node tools/dev.js check`. Regression: `node tools/dev.js test` (content/storage, mocked AI, Python practice cases).
- Preview: `node tools/dev.js serve --host 0.0.0.0 --port 8765`; the server serves only `project/`. Run long-lived previews separately from setup.
- Browser regression: `node tools/dev.js browser`. `tools/browser-runtime.js` uses Edge on Windows and Chromium on Linux/macOS; `PLAYWRIGHT_CHANNEL` overrides the choice. Dependencies in `.codex-tools/` are ignored by Git.
- Keep the existing classic script order shown in `project/index.html` (data → learning → storage → ai-config → ai → app). The existing DeepSeek AI feature is the only runtime network exception; do not add other runtime dependencies.
- Routine tests mock AI requests. Do not run `tools/deepseek-smoke.js` unless the task explicitly needs a real, billable API check. Never print the key in `project/js/ai-config.js` to logs, responses or screenshots. Keep the repository private while it contains this competition configuration.

## Coding Style & Naming Conventions

Use UTF-8 and two-space indentation. Follow existing JavaScript conventions: strict-mode IIFEs, single quotes, semicolons, `const` by default, and camelCase functions. Use kebab-case CSS classes, asset filenames, and stable record IDs such as `wang-zongyu`. Keep shared exports under `window.StarPath` and UI text in Chinese. Reuse CSS variables and existing components. No formatter or linter is configured; avoid unrelated reformatting.

## Testing Guidelines

Existing automated tests use Node's built-in test runner, Python's standard library, and optional Playwright browser runners; there is no coverage threshold. Manually verify affected flows: hash navigation and browser history, search/filtering, favorites, plan editing, progress, and refresh persistence. Storage changes require valid/invalid JSON import, cancellation, empty-state, and unavailable-storage checks. Check 390px and 1440px layouts, keyboard focus, image loading, and console errors. If adding automated tests, use descriptive `*.test.js` names and document their runner.

## Commit & Pull Request Guidelines

Prefer concise imperative subjects, optionally prefixed with `feat:`, `fix:`, or `docs:`. PRs should describe behavior changes, link relevant issues, list verification performed, and include desktop/mobile screenshots for visual changes.

## Data & Content Integrity

Render user input as escaped text. Validate imports before confirmation and replacement; preserve existing data on failure. Keep resources local and retain official photo/report sources and dates. Do not invent alumni facts or substitute unverified portraits; clearly distinguish suggested growth templates from documented experiences.
