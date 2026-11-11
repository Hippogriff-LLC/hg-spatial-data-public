# Sprint 001 — Public release documentation and repository presentation

**Target:** `Hippogriff-LLC/hg-spatial-data-public`, `main` only.  
**Agent:** Codex, `gpt-6.1-sol`, **high** effort.  
**Scope:** Already-published HG Spatial Data open-source distribution; **documentation and public repository presentation only**.

## Owner direction — authoritative

HG Spatial Data has **already been approved and publicly launched**. This sprint fixes the embarrassing pre-publication/blocker text in its public GitHub repository so the public project can be linked from the Hippogriff website. Do not reopen release approval, product design, support-matrix gates, or packaging work.

**Absolutely forbidden:** adding tests, test files, test suites, test harnesses, QA scaffolding, or test instructions. Do not run tests as part of this documentation sprint. No library/API/runtime/vendor/example logic changes. No new dependency or build system. No change to the private `Hippogriff-LLC/hg-spatial-data` repository, workstation/control, HG CRM, the Hippogriff website repository, or any other project. No autonomous release reconstruction, rebuilding, replacing download archives, retagging, version bump, npm publication, or overwriting existing GitHub release assets.

## Facts already established (verify against this public repo; do not restart decision-making)

- Public repository: https://github.com/Hippogriff-LLC/hg-spatial-data-public
- Published release: https://github.com/Hippogriff-LLC/hg-spatial-data-public/releases/tag/v1.0.0-rc.1
- Published tag/version: `v1.0.0-rc.1` / `1.0.0-rc.1`. **Do not claim a final `v1.0.0` stable tag exists.** Publicly launched does not mean npm registry-published.
- Downloads already present: `hg-spatial-data-1.0.0-rc.1.zip` and `hg-spatial-data-1.0.0-rc.1.tgz`.
- Library: vanilla-JavaScript in-browser viewer for preloaded 2D/3D point data and explicitly supplied relationships, selection, clustering/bundling, focus/back, updates. No required framework, application backend, or mandatory consumer build step.
- `hg-spatial.js`, versioned `vendor` renderer files, `examples/2d.html`, `examples/3d.html`, `API.md`, `LICENSE`, and third-party notices are already public.
- HG library license is MIT; its bundled Cytoscape/Babylon vendor files carry their applicable separate licenses.
- The npm-compatible TGZ is offered as a **release download**; `package.json` currently includes `"private": true`, and no npm registry publication has occurred. Do not change this setting or imply `npm install hg-spatial-data` from the public registry works.
- Public repo About currently lacks description, homepage and topics.

## Work to perform

1. Read **only this public repository's** current source/docs and identify outward-facing statements that incorrectly say the release is blocked, unassembled, unpublished, nonexistent, pending authorization, or available only locally. Fix the statements without hiding useful technical limitations. Do not ingest/rely on private repository release checklists to drive a new review.
2. Replace the root `README.md` with a crisp, confident, technically accurate open-source project landing page. Lead with what the library does, who it helps, true 2D/3D and relationships capability, GitHub release download link, simple unbundled browser usage, live-file structure, and links to accurate API/example docs. Use actual shipped entrypoints and renderer script names; keep the static-file path the default. Include how to open/run the bundled HTML examples if local serving is necessary. State the public tag accurately as `v1.0.0-rc.1`. Avoid lengthy internal development-status tables, blocked matrices, process anxiety, or warnings unrelated to getting started. Do not advertise nonexistent npm registry/CDN services, framework imports, hosted demo, or feature claims not supported by the code.
3. Correct `CHANGELOG.md` to reflect that this specific candidate was actually published as the **first public GitHub release** on November 10, 2026 (US Eastern; GitHub UTC timestamp can be November 11). Remove statements that assembly/publication are currently blocked. Record docs-only post-publication updates separately from the immutable release artifact, if needed.
4. Revise `ASSEMBLY.md` so it is accurately labeled maintainer-oriented background/how the existing artifact was produced, not a declaration that no release exists. It may retain useful maintenance details; no release rebuild is needed.
5. Review `API.md`, `source/docs/release/rc/*.md`, and any other public Markdown for the same false pre-publication claims. Correct documentation where necessary, being clear that the **existing tagged release assets are immutable historical payloads**; edits to GitHub `main` documentation do not silently modify those downloads. Keep technical API names, semantics, and documentation truthful.
6. Improve `package.json`'s purely descriptive fields (description, repository, homepage, keywords) only if genuinely useful and accurate. **Do not change `private`, version, browser entrypoint, file list, or package/runtime behavior.** Do not add npm publish scripts.
7. Improve GitHub repository **About** metadata (clear one-line description and appropriate discoverability topics; homepage may link to the actual Hippogriff site only if verified). Use native GitHub CLI only if authorized access is present; otherwise report precisely what owner-run metadata action remains. No need to mutate any other repository or organization settings.
8. Make the public README suitable for linking from the Hippogriff website. You may include one concise factual project description in the README, but **do not edit the website**, create a separate marketing project, or instruct its team on implementation.
9. Commit and push the documentation-only changes to the **public repository `main`**, following that repository's actual existing governance. No agent-run tests are needed or allowed. Preserve the already-published release and private development repository unchanged.

## Completion response

Return only: public repo and commit link, concise description of documents/metadata corrected, confirmation that **no tests were added or run**, confirmation that application/runtime files and existing release tag/assets were untouched, and any *concrete* obstacle to updating About metadata. No long terminal dumps or test-score reporting; if a detailed deliverable is actually required, use the existing `csjs-deliver` workflow rather than dumping docs to the terminal.

**Success means:** opening public GitHub `main` shows a clean usable open-source README and truthful release documentation, ready for a normal link from the Hippogriff website. No new approval request.
