# Repository Guidelines

## Project Structure & Module Organization
The Next.js app router lives in `src/app`, with locale-aware routes under `src/app/[locale]` and API handlers in `src/app/api`. Shared UI components sit in `src/components`, reusable helpers in `src/lib`, and MDX-driven content blocks in `src/mdx`. Place static assets in `public/`, long-form references in `docs/`, and locale strings in `messages/`. Import internal modules through the `@/` alias defined in `tsconfig.json` to keep paths stable.

## Build, Test, and Development Commands
- `pnpm install` – install dependencies; rerun after dependency or patch changes.
- `pnpm dev` – run the Next.js dev server with Turbopack on port 3000.
- `pnpm lint` – execute ESLint (Next config + unused-imports); must pass before a PR.
- `pnpm build` – regenerate the blog index then compile the production bundle.
- `pnpm start` – serve the compiled bundle for pre-release smoke testing.
- `pnpm generate-blog-index` / `pnpm check-translations` – refresh MDX metadata and validate locale coverage when editing content.

## Coding Style & Naming Conventions
Write features in TypeScript with strict mode enabled. Prefer functional React components, two-space indentation, trailing commas, and Tailwind utility classes for styling. Name components and hooks with `PascalCase`/`camelCase`, keep constants in `UPPER_SNAKE_CASE`, and align route filenames with the published URL. Run `pnpm lint` to enforce ESLint rules and unused import pruning; format riffs should follow the default Next.js Prettier settings.

## Testing Guidelines
Automated tests are not yet wired in, so treat `pnpm lint`, `pnpm build`, and a local `pnpm start` smoke pass as the minimum regression gate. When adding a test harness, colocate specs in `__tests__` folders next to the feature and name them `*.test.ts(x)`. Document any manual QA steps in the PR to keep reviewers aligned until end-to-end coverage lands.

## Commit & Pull Request Guidelines
Commits follow the `<type>(scope): message` convention (`feat(blog): add abode`, `fix(email): adjust email`). Keep commits focused and annotate breaking changes explicitly. Each PR should describe the change, link related issues, and include visuals for UI deltas. Confirm `pnpm lint` and `pnpm build` locally, mention any generated artifacts (blog index, translations), and request review from an owner of the touched area.

## Localization & Content Workflow
Update `messages/en.json` alongside new strings, then run `pnpm check-translations` to catch gaps. After editing MDX or docs entries, execute `pnpm generate-blog-index` so navigation metadata stays current. Verify language switching in `http://localhost:3000/en` (and other locales as they launch) before merging.
