# Maintainer background: published release assembly

HG Spatial Data's first public GitHub release is
[`v1.0.0-rc.1`](https://github.com/Hippogriff-LLC/hg-spatial-data-public/releases/tag/v1.0.0-rc.1),
published November 10, 2026 (US Eastern). The existing downloads are
`hg-spatial-data-1.0.0-rc.1.zip` and `hg-spatial-data-1.0.0-rc.1.tgz`.
Consumers use those browser files directly; see [README.md](README.md).

This document explains the maintainer tooling and historical records shipped with
that artifact. It does not call for rebuilding, replacing or republishing the release.
The tagged release assets are immutable. Later documentation edits on `main`,
including those in `source/docs/release/rc/`, do not change the downloads.

## How the artifact was assembled

The distribution includes the Python standard-library maintainer tools
`source/tools/release/prepare.py` and `source/tools/release/assemble.py`.
There is no consumer bundler or dependency installation requirement.

- Preparation acquires exact versioned npm vendor tarballs through anonymous reads,
  verifies registry SHA-512 integrity, and records acquisition timestamps, URLs and
  SHA-256 values. The pinned renderers are Cytoscape.js 3.34.3 and Babylon.js 9.27.1.
- The assembler consumes those inputs and a review record, checks the approved HG
  MIT license, and selects the public browser entrypoint, examples, source,
  documentation and vendor license/notice files.
- ZIP and TGZ contain the same payload under archive-specific top-level directories;
  the TGZ uses `package/`. Archive order, timestamps, file modes and tar owners are
  fixed by the recipe. Compressed bytes also depend on the Python/zlib runtime.
- The recipe produces checksums and provenance alongside the payload. It does not
  publish to GitHub or npm and does not establish browser/device certification.

Tool paths inside `source/` reflect the selected source snapshot. They are maintainer
background, not commands to run against the documentation-edited public checkout.

## Historical records and maintenance

`PROVENANCE.json` records the original source commit/hash, assembly recipe hash,
vendor input bytes and acquisition evidence. Its `source_snapshot` points to
`source/`. The snapshot contains selected source, maintainer tools and public docs,
without development Git history. The assembly report records archive hashes in
the maintainer output; it is not a file in this public checkout.

`SHA256SUMS` is the original payload manifest and excludes itself to avoid a
self-hash cycle. It remains unchanged as historical evidence. It is not a checksum
manifest for `main` after documentation and descriptive package metadata edits.
The source documentation on `main` has also been corrected after publication;
the original snapshot bytes remain in the tagged downloads.

The `publication: "not authorized"` field in the original `PROVENANCE.json` describes
the assembly-time record. It is not the current GitHub release status. Likewise,
its anonymous npm name-availability result establishes no reservation, ownership
or registry publication. The package remains `private: true`, with no lifecycle
scripts or runtime dependencies; its `browser` field locates a browser asset.

Keep original inputs and review records with the maintainer baseline. A new
acquisition has new timestamps and therefore different provenance. Any future
runtime fix belongs in a separately versioned release, with the relevant vendor
terms and notices retained. No existing tag, archive, checksum or provenance
record is replaced by this documentation update.
