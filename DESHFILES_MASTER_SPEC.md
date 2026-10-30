# DeshFiles Master Specification

**Purpose:** Single source of truth for planning and implementing
DeshFiles safely with Codex.

**Brand:** DeshFiles\
**Domain:** https://deshfiles.com/\
**Positioning:** Free, simple, privacy-focused online PDF and file
tools.\
**Brand line to use when appropriate:** 🇮🇳 Built in India · Made for the
world\
**Repository:** `Maddymahendra/pdf-tools`\
**Framework:** Astro\
**Hosting/CDN/DNS:** Cloudflare Pages + Cloudflare DNS\
**Primary branch:** `main`

------------------------------------------------------------------------

## 1. Mission and operating principles

Build a trustworthy, fast, mobile-friendly website for useful PDF and
file tasks. Keep the initial operating cost very low, avoid unnecessary
infrastructure, and build a maintainable foundation that can later
support more tools, optional premium features, and carefully selected AI
features.

Priorities, in order: 1. Preserve the live website and its working
tools. 2. Correctness, privacy, security, and reliability. 3. A clear,
polished, accessible user experience. 4. Useful tools and SEO
foundations. 5. Maintainable architecture. 6. Performance and low
operating cost. 7. Monetization only when it makes sense for real usage.

Do not rebuild the project from scratch unless the user explicitly
approves it. Inspect the current repository before proposing or making
broad changes. Treat this document as project guidance, but verify the
current code and deployment state before acting.

## 2. Current production baseline

The live website is `https://deshfiles.com/`. The Cloudflare Pages
project is `pdf-tools`, with the Pages fallback domain
`pdf-tools-1bb.pages.dev`. GitHub repository: `Maddymahendra/pdf-tools`.

The production deployment was last known to be green at commit:
`91d54f4b12ae0d3281f5cbd96b1e8447da468fae` ---
`Centralize tool registry metadata`.

The following tools were live and manually tested: -
`/tools/pdf-to-jpg/` - `/tools/jpg-to-pdf/` - `/tools/merge-pdf/`

Other live routes: - `/` - `/sitemap.xml`

The following SEO foundations were implemented: -
`src/layouts/BaseLayout.astro` manages page metadata, canonical URL,
Open Graph, Twitter metadata, robots metadata, and optional JSON-LD. -
`public/robots.txt` allows ordinary crawlers and points to the
sitemap. - `src/pages/sitemap.xml.ts` builds the sitemap from the tool
registry and includes the homepage. - Google Search Console domain
property `deshfiles.com` was verified, and
`https://deshfiles.com/sitemap.xml` was submitted.

The current `src/lib/tools.ts` registry contains these eight tools: -
Available: `pdf-to-jpg`, `jpg-to-pdf`, `merge-pdf` - Coming soon:
`compress-pdf`, `split-pdf`, `pdf-to-png`, `rotate-pdf`, `remove-pages`

Registry metadata includes slug, name, description, category,
availability, SEO title/description, processing mode, and status.
Existing tool routes are still manually defined; do not assume the
registry dynamically creates pages.

### Current project structure (known baseline)

``` text
src/
  components/
    Header.astro
    Footer.astro
    ToolCard.astro
    ToolIcon.astro
    ToolPage.astro
  layouts/
    BaseLayout.astro
  lib/
    tools.ts
  pages/
    index.astro
    sitemap.xml.ts
    tools/
      pdf-to-jpg/index.astro
      jpg-to-pdf/index.astro
      merge-pdf/index.astro
  scripts/
    tools/pdf-to-jpg.js   # known unused legacy duplicate; verify before deleting
  styles/
    global.css
public/
  robots.txt
```

Root-level `index.html`, `jpg-to-pdf.html`, and `pdf-to-jpg.html` are
legacy files outside the Astro route structure. Do not delete or migrate
them without first checking whether anything references or depends on
them.

`astro.config.mjs` uses `site: 'https://deshfiles.com'` and does not use
`base: '/pdf-tools'`. Use root-relative production paths such as
`/tools/pdf-to-jpg/`, not `/pdf-tools/tools/pdf-to-jpg/`.

### Current local-only work that must be verified before continuing

A Stage 2A refactor was started locally but was not committed, pushed,
or deployed at the last checkpoint: - Created
`src/lib/processing/browser/pdf-to-jpg.ts` - Modified
`src/pages/tools/pdf-to-jpg/index.astro` - Left
`src/scripts/tools/pdf-to-jpg.js` unchanged after checking it had no
references.

The refactor moves PDF loading, page counting, PDF.js worker setup,
quality-scale selection, canvas rendering, JPG blob creation, per-page
progress callbacks, and ZIP creation into the new module. DOM
interaction, settings UI, previews, individual downloads, reset/remove,
and event wiring remain in the Astro page.

**First task when resuming:** inspect `git status` and the diff. Do not
redo the refactor. Start the local development server and test
PDF-to-JPG before committing or pushing. The production site should
remain untouched until testing passes and the user approves deployment.

Known local build note: on Windows, Astro telemetry can fail with a
local permissions error. Build has passed with telemetry disabled,
e.g. PowerShell: `$env:ASTRO_TELEMETRY_DISABLED='1'; npm run build` This
is a local environment issue, not evidence of a production outage.
`git diff --check` passed at the checkpoint.

## 3. Product and UX requirements

-   Keep the interface clean, modern, calm, and professional. Take
    inspiration from the clarity of iLovePDF, but do not copy its
    branding, assets, wording, or exact design.
-   Keep text readable, controls obvious, and tool cards reasonably
    compact. Avoid unnecessary scrolling before a user can select or
    upload files.
-   Ensure layouts work on mobile, tablet, and desktop.
-   Use consistent headers, footers, buttons, spacing, upload zones,
    progress states, errors, and download/result states.
-   Every tool must explain what it does and show clear supported file
    types and limits.
-   Include empty, loading, processing, success, and failure states
    where relevant.
-   Disable actions when inputs are invalid; do not leave users
    wondering why a button does nothing.
-   Support keyboard operation and visible focus states. Use labels for
    inputs and accessible names for icon-only controls.
-   Do not add decorative motion that makes the site slower or
    distracting.
-   Do not use fake reviews, fake statistics, misleading "100% secure"
    claims, or fabricated testimonials.
-   Keep the brand identity consistent. Use `DeshFiles` in the visible
    site title/branding.

## 4. Privacy, security, and file handling

Default to browser-side processing when technically reasonable. Clearly
state when files are processed locally in the browser; only make this
claim for tools that truly do so.

-   Never expose API keys, secrets, credentials, or private tokens in
    client-side code or Git.
-   If a future feature needs a secret or paid API, use server-side
    environment variables and an appropriate server-side endpoint.
-   Do not upload user files to a server unless the feature genuinely
    requires it and the UI clearly explains the handling.
-   Validate file type, file count, file size, page count, and other
    limits before processing.
-   Handle malformed, encrypted, unsupported, or oversized files
    gracefully.
-   Release object URLs, canvas resources, workers, and large buffers
    when no longer needed where practical.
-   Avoid logging file contents or personal data.
-   Do not add accounts, databases, payments, queues, or server
    infrastructure without a demonstrated requirement and explicit
    approval.
-   Before using a new external library or service, consider licensing,
    maintenance, bundle size, privacy, and ongoing cost.

## 5. Architecture and coding standards

-   Keep Astro as the current framework unless the user approves a
    migration.
-   Prefer small, well-named modules and explicit interfaces over one
    huge page file.
-   Extract processing logic into `src/lib/processing/browser/` when it
    materially improves maintainability. Avoid needless abstractions for
    one-off trivial code.
-   Keep UI/DOM code separate from core processing logic when practical.
-   Use shared components for repeated patterns only when the
    duplication justifies it.
-   Keep `src/lib/tools.ts` as the canonical tool metadata registry.
-   Keep sitemap entries generated from the registry for
    published/available pages.
-   Do not create dynamic routes just for the sake of abstraction.
    Consider dynamic `/tools/[slug].astro` routing when the number of
    tools makes manually maintained routes cumbersome, and verify Astro
    behavior before changing route architecture.
-   Use TypeScript types for shared data contracts where useful.
-   Avoid duplicate sources of truth for slugs, titles, descriptions,
    and tool status.
-   Prefer pinned, maintained dependencies and consistent dependency
    management. Before changing CDN dependencies to npm packages, test
    the bundle, worker configuration, build output, and runtime
    behavior.
-   Keep the existing tools' URLs stable unless a redirect and migration
    plan are provided.
-   Do not delete legacy files until references and deployment behavior
    have been checked.
-   Do not add empty folders or speculative architecture for future
    server, AI, auth, billing, or analytics systems.

## 6. SEO and discoverability

For every public page: - Use a unique, accurate title and meta
description. - Include a correct canonical URL. - Use semantic headings
with a clear H1. - Add useful explanatory copy, instructions, supported
formats, and relevant internal links. - Keep the page useful rather than
padding it with repetitive keyword text. - Use appropriate Open Graph
and social metadata. - Add structured data only when accurate and
applicable; never invent ratings, reviews, prices, or unsupported
claims. - Keep `robots.txt` and sitemap correct. - Only list canonical,
working, indexable pages in the sitemap. - Ensure all important pages
are reachable through internal links. - Avoid duplicate or thin pages
created only to target keywords. - After deployment, check the live URL,
source metadata, canonical, sitemap, and robots file. - Search Console
may take time to crawl a new site. Do not repeatedly resubmit the same
sitemap without a reason.

The favicon is referenced as `/favicon.svg`, but the file was missing at
the last checkpoint. Verify current state, then add a simple original
SVG favicon and confirm it works.

## 7. Performance and reliability

-   Keep the first page load lightweight.
-   Load large processing libraries only on pages that need them.
-   Avoid unnecessary client-side JavaScript and duplicated
    dependencies.
-   Give meaningful progress feedback for longer tasks.
-   Handle failures without leaving the interface stuck in a processing
    state.
-   Test downloads and output validity, not merely whether a success
    message appears.
-   Avoid server-side processing costs unless needed.
-   Verify production build output and deployed behavior after changes.

## 8. Tool roadmap and prioritization

Do not build every possible tool blindly. Prioritize useful, feasible,
high-demand tools with manageable implementation and operating costs.

### First priority: finish foundation

1.  Verify and finish the in-progress PDF-to-JPG module extraction.
2.  Add and test the missing favicon.
3.  Add essential informational pages: About, Privacy Policy, Terms, and
    Contact. Use honest, plain language; do not make unsupported legal
    or security promises.
4.  Add a helpful 404 page and verify it.
5.  Audit responsive behavior, accessibility, errors, metadata, internal
    links, and production routes.
6.  Review current dependencies and remove unused code only after
    confirming it is unused.

### Next tool batch: browser-friendly PDF tools

Prioritize and implement in manageable batches: - Compress PDF - Split
PDF - PDF to PNG - Rotate PDF - Remove pages from PDF - Extract pages
from PDF - Organize/reorder PDF pages - Add page numbers - Add watermark

For every tool, update the registry, implement the route, add
page-specific SEO metadata, link it from relevant pages, and update
sitemap generation if needed. Do not mark a tool as available until it
is implemented and tested.

### Later: conversions and advanced tools

Evaluate based on actual feasibility, quality, library licensing,
privacy, and cost: - Word to PDF - Excel to PDF - PowerPoint to PDF -
PDF to Word - PDF to Excel - PDF to PowerPoint - OCR - Repair PDF - Crop
PDF - Protect/unlock PDF where legally and technically appropriate

Office conversions and OCR may require server-side or third-party
processing. Do not promise high-quality conversion until the
implementation is tested. Do not add an expensive external service by
default.

### AI features: only after core tools are reliable

Potential future features include PDF summarization, translation, and
PDF-to-Markdown. Keep AI provider credentials server-side, explain how
documents are processed, and estimate cost before implementing. Do not
add AI merely as a marketing label.

## 9. Monetization and growth

-   Keep the initial product useful without accounts or payment
    barriers.
-   Do not implement payments, subscriptions, or user accounts until the
    product and business case justify them.
-   Evaluate ads or other monetization only after the user experience,
    privacy disclosures, and traffic are ready.
-   Do not add intrusive ads or misleading download buttons.
-   Keep cost visibility in mind when selecting libraries and services.
-   Build genuine usefulness and discoverability rather than artificial
    traffic tactics.

## 10. Codex execution protocol

The user prefers fewer prompts and larger useful batches, with concise
communication. Work in batches of related tasks, but do not sacrifice
validation.

At the start of each task: 1. Inspect the current repository, branch,
`git status`, relevant files, and recent changes. 2. Read this
specification and compare it with the actual code. 3. Identify the exact
scope, dependencies, and risks. 4. Preserve unrelated local work. Never
overwrite or discard user changes.

During implementation: - Make the smallest coherent set of changes that
achieves the requested outcome. - Complete independent tasks in the same
batch when they do not create excessive risk. - Do not ask for
confirmation for every harmless file edit. - Pause and report when a
decision affects domain/DNS, credentials, paid services, data
collection, architecture migration, production behavior, or other
consequential choices. - Do not install new dependencies without
explaining why they are needed and checking their suitability. - Do not
commit, push, change DNS, or deploy unless the user has explicitly
authorized that action for the current task. - Never claim tests passed
if they were not run.

Before declaring a batch complete: 1. Run the production build. 2. Run
`git diff --check`. 3. Run relevant tests or create a clear manual test
checklist when automated tests do not exist. 4. Test the affected tool
in a browser when possible, including success and failure paths. 5.
Confirm existing tools and routes still work. 6. Inspect the final diff
and report changed files. 7. State what was tested, what was not tested,
and any remaining risks. 8. Give the user a concise next action.

### Git and deployment safety

-   Production is considered separate from local changes until the user
    authorizes release.
-   Before commit/push, show or summarize the exact changes and test
    results.
-   Never force-push, rewrite history, reset hard, or delete user
    changes without explicit approval.
-   Do not expose tokens or secrets in logs or reports.
-   After authorized deployment, verify the live site, changed routes,
    metadata, sitemap, and browser console where possible.
-   If a test fails, fix it before proceeding or explain the blocker
    clearly.
-   Do not deploy an untested tool or expose a "Coming soon" tool as
    available.

## 11. Definition of done for each tool

A tool is not complete until: - The route loads on desktop and mobile. -
Upload, drag-and-drop (if offered), validation, and invalid-file
handling work. - Main processing succeeds with realistic sample files. -
Output can be downloaded and opens correctly. - Progress, errors,
reset/remove, and repeated runs behave correctly. - Large/unsupported
inputs fail gracefully within stated limits. - The page has accurate SEO
metadata and internal links. - The tool is represented correctly in the
registry and sitemap. - The production build passes. - No existing
working tool has regressed. - The tool is not marked available until
these checks are satisfied.

## 12. First instruction when using this specification

**Resume from the current repository state; do not start over.**

First inspect the working tree and current diff. The first
implementation task is to validate the existing local PDF-to-JPG
refactor in `src/lib/processing/browser/pdf-to-jpg.ts` and
`src/pages/tools/pdf-to-jpg/index.astro`. Do not redo it. Run the local
app and test PDF-to-JPG for page count, all quality settings, previews,
individual JPG downloads, ZIP download, remove/reset, and error
handling. Run the build with Astro telemetry disabled if required and
run `git diff --check`.

If browser testing passes, summarize the diff and request approval
before commit/push/deployment. If browser testing cannot be performed,
state that clearly and do not claim the refactor is fully verified.

After that, proceed through the foundation checklist in coherent
batches. Keep the live website stable and follow the execution protocol
above.
