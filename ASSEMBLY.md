# Local RC assembly recipe

Maintainer tooling only: Python 3.12 standard library, no bundler or dependency install.
Consumers copy already assembled browser assets. No command here publishes anything.

1. Preserve the approved project LICENSE: canonical MIT text, copyright 2026
   Hippogriff Technology LLC. The RC assembler pins the full license SHA-256 and rejects
   changed terms or holder; later approved license changes require a reviewed recipe
   update. Resolve the preferred npm identifier using the registry. The
   helper below performs anonymous reads only, stages exact versioned npm tarballs,
   verifies their registry SHA-512 integrity and records timestamps/URLs/SHA-256.
2. In an approved governed execution session, from the reviewed source tree, run
   `python3 tools/release/prepare.py --output dist/release-inputs`.
   Inspect preserved package inventories, metadata, browser banners, all license/NOTICE
   files, embedded dependencies, optional loaders and current advisories. Preserve any
   extra applicable attribution texts in the verified input inventory. The helper
   cannot automatically establish that embedded obligations are complete. Inspect
   actual runtime use to determine required auxiliary browser assets. A nonempty
   runtime dependency list or a required additional asset needs bounded remediation
   before this assembler supports it. Never remove notices to force assembly.
3. Record results in `dist/release-inputs/review.json`: the verification.json SHA-256,
   `license_inventory`, `runtime_asset_inventory`, `advisory_review`, each `PASS` only
   after its review actually passes. Keep detailed evidence separately. Name conflicts
   or inconclusive availability require human review; no scoped owner is invented.
4. Run `python3 tools/release/assemble.py --check`, then
   `python3 tools/release/assemble.py --inputs dist/release-inputs --output dist/1.0.0-rc.1`.
   The browser entrypoint must match the recorded source commit. Preparation-only
   public-document caveats must be updated to measured results before final release
   acceptance. The assembler does not declare Human QA accepted.
5. Repeat unchanged with `--output dist/1.0.0-rc.1-repeat`. Compare both archive hashes
   and unpacked file manifests. Archive order, timestamps, file modes and tar owners
   are fixed. Compression equivalence is within the recorded Python/zlib runtime;
   do not assume every compressor version gives the same compressed bytes.
6. Inspect exact files in assembly-report.json, unpack ZIP/TGZ into fresh QA directories,
   verify SHA256SUMS (which covers every other file), entrypoint/version, matching
   payloads, text-safe fixtures, no private files and real-browser local assets.
   `npm pack --ignore-scripts --offline --json ./dist/1.0.0-rc.1/static` is an optional
   local compatibility check in a separate output directory with a local npm cache.
   Compare unpacked contents; npm-generated tar compression need not match Python.
   Locally install the canonical TGZ with scripts disabled/offline and inspect it.

The canonical artifacts are `hg-spatial-data-1.0.0-rc.1.zip` and
`hg-spatial-data-1.0.0-rc.1.tgz`; both contain the same files, with archive-specific
top-level directories. package.json is private:true and has no lifecycle scripts or
runtime dependencies. Its browser field locates an asset; it does not promise an
importable module. SHA256SUMS excludes itself to avoid a self-hash cycle. Archive hashes
and source SHA are in assembly-report.json. PROVENANCE.json binds source commit, actual
runtime bytes, recipe and acquisition evidence. The public source snapshot contains
only selected source, maintainer tools and public docs; no Git history or private QA.
For reconstruction without Git, pass the original provenance `--source-commit` value;
the reconstructed source hash must also match PROVENANCE.json.

Keep verified inputs and review evidence with the maintainer baseline. A second
acquisition has new timestamps and therefore new provenance; use unchanged inputs for
reproducibility. No reserved package name or ownership is established by HTTP 404.
Do not publish, tag, deploy or create an account from this recipe.
