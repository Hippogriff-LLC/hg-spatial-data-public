# HG Spatial Data release documentation source

The first public GitHub release,
[`v1.0.0-rc.1`](https://github.com/Hippogriff-LLC/hg-spatial-data-public/releases/tag/v1.0.0-rc.1),
was published November 10, 2026 (US Eastern). Its downloads are
`hg-spatial-data-1.0.0-rc.1.zip` and `hg-spatial-data-1.0.0-rc.1.tgz`.
The candidate version is published on GitHub; it is not a final `v1.0.0` stable
tag or an npm registry publication.

Start with the [project README](../../../../README.md) for browser setup,
the shipped file layout and instructions for opening the bundled
[2D](../../../../examples/2d.html) and [3D](../../../../examples/3d.html) examples.
HG Spatial Data uses `HGSpatial.create` from `hg-spatial.js`, with
`vendor/cytoscape-3.34.3.min.js` for 2D or `vendor/babylon-9.27.1.js` for 3D.
It displays supplied points and explicit relationships with selection,
clustering/bundling, focus/Back and updates, without a required framework or
consumer build step.

This directory holds the public documentation source included in the selected
source snapshot. Documentation here on `main` has been corrected after publication;
the existing tagged ZIP/TGZ assets retain their original historical payloads.
These edits do not rebuild or silently change those downloads.

- [API reference](API.md): public data, options, methods and events.
- [Changelog](CHANGELOG.md): first public release and later documentation updates.
- [Assembly background](ASSEMBLY.md): maintainer tooling and historical records.
- [License](../../../../LICENSE) and
  [third-party notices](../../../../THIRD_PARTY_NOTICES.txt): HG MIT terms and
  separate bundled vendor terms.
