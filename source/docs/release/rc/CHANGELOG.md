# HG Spatial Data changelog

## Post-publication documentation — November 10, 2026 (US Eastern)

- Replaced preparation-era release blockers with accurate public download and
  browser setup guidance, including the bundled 2D/3D examples.
- Clarified the published candidate tag, GitHub-only ZIP/TGZ distribution,
  maintainer assembly background and descriptive package metadata.
- Corrected the documentation on `main`, including `source/docs/release/rc/`.
  These documentation and metadata edits do not modify the existing tagged
  release assets, runtime code or historical checksum/provenance records.

## 1.0.0-rc.1 — first public GitHub release

Published **November 10, 2026 (US Eastern)** as
[`v1.0.0-rc.1`](https://github.com/Hippogriff-LLC/hg-spatial-data-public/releases/tag/v1.0.0-rc.1).
GitHub records the publication as November 11, 2026 at 02:54 UTC.
This is the first public GitHub release, not a final `v1.0.0` stable release or
an npm registry publication.

The release provides `hg-spatial-data-1.0.0-rc.1.zip` and
`hg-spatial-data-1.0.0-rc.1.tgz`, containing browser assets, bundled renderers,
2D/3D examples, API documentation, corresponding HG source, licenses and notices.

Introduces the `HGSpatial.create` configuration/controller API over Cytoscape.js 2D
and Babylon.js 3D: original identity, explicitly supplied relationships,
zoom-driven clusters/bundles, selection, inspection, focus/Back, live updates,
queued events and atomic identity errors.

Includes maintainer-only archive assembly tools, explicit public-file selection,
checksums and provenance. HG is MIT licensed, copyright 2026 Hippogriff Technology LLC;
bundled vendor licenses apply separately. The package is `private: true`.

Known limits include global renderer coexistence, synchronous hierarchy rebuilding
and differences in 3D cosmetic fidelity. No comprehensive browser/device,
accessibility, offline/CSP certification or measured performance budget is claimed.

There is no earlier public version. Future migrations document replacements and
preserve original source identity; aggregate identities are not durable application
records. Existing release assets remain immutable.
