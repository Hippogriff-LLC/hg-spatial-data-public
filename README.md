# HG Spatial Data

HG Spatial Data is a vanilla-JavaScript browser viewer for preloaded 2D and 3D
point data and explicitly supplied relationships. It helps developers build
interactive data explorers with selection, inspection, zoom-driven clustering,
relationship bundling, focus/Back navigation and live updates while preserving
original source IDs.

Use it with static browser files: no required framework, application backend or
consumer build step.

**[Download the first public GitHub release — v1.0.0-rc.1](https://github.com/Hippogriff-LLC/hg-spatial-data-public/releases/tag/v1.0.0-rc.1)**,
published November 10, 2026 (US Eastern). This is the published release-candidate
tag; it is not a final `v1.0.0` stable tag.

## Get started

Download and unpack
[hg-spatial-data-1.0.0-rc.1.zip](https://github.com/Hippogriff-LLC/hg-spatial-data-public/releases/download/v1.0.0-rc.1/hg-spatial-data-1.0.0-rc.1.zip).
Keep `hg-spatial.js`, `vendor/`, `source/`, `licenses/`, `LICENSE` and
`THIRD_PARTY_NOTICES.txt` together when copying the distribution to your static host.

Create an HTML page in the unpacked distribution directory. Load the renderer first,
then HG, and supply an empty, connected container with a width and height:

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>HG Spatial Data example</title>
<div id="viewer" style="height:520px;width:100%"></div>
<script src="./vendor/cytoscape-3.34.3.min.js"></script>
<script src="./hg-spatial.js"></script>
<script>
const viewer = HGSpatial.create(document.getElementById('viewer'), {
  points: [
    {id: 'west', x: 0, y: 2, label: 'West'},
    {id: 'east', x: 10, y: 6, label: 'East'}
  ],
  relationships: [{id: 'signal', source: 'west', target: 'east'}]
});
// Call viewer.destroy() when removing this view.
</script>
</html>
```

For **3D**, load `./vendor/babylon-9.27.1.js` in place of Cytoscape and give
each point a finite `z` coordinate, including zero. Auto mode selects 3D when a
nonempty dataset has Z on every point; otherwise it selects 2D. Explicit
`{view: {mode: '3d'}}` is the optional third argument to `HGSpatial.create`.
3D requires working WebGL.

Load only the renderer you need. Before switching modes with
`viewer.setOptions({view: {mode: '3d'}})` or `'2d'`, the host must load the
corresponding renderer. HG does not download a missing engine or silently switch
to 2D. Data updates preserve the resolved mode; explicitly requesting `'auto'`
re-evaluates the current data.

## Run the bundled examples

The [2D example](examples/2d.html) and [3D example](examples/3d.html) include
fabricated numeric data, selection, incremental updates, mode switching and
large-target/reduced-motion controls. These links point to source files; run them
from the downloaded distribution or a clone of this repository.

Serve the distribution directory with your existing static server. If Python 3
is available, run this from that directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/examples/2d.html> or
<http://127.0.0.1:8000/examples/3d.html> in your browser. Each example initially
loads its own local renderer; its mode-switch button loads the other bundled
renderer on demand.

## Data and interaction

Supply `{points, relationships?}` with exact nonempty string IDs and finite
numeric X/Y coordinates, plus optional Z. Relationships explicitly reference point
IDs; proximity never creates links. Labels and JSON metadata are displayed as text.
Normalize dates and categories in your application; axis descriptions format
coordinates without transforming them.

```js
const unsubscribe = viewer.on('selectionchange', event => {
  const selection = event.payload.selection;
  if (selection) console.log(selection.originalIds);
});
viewer.applyChanges({points: [{id: 'east', x: 12}]});
viewer.setOptions({accessibility: {targetSize: 'large', reducedMotion: 'always'}});
// On cleanup: unsubscribe(); viewer.destroy();
```

The viewer provides keyboard controls, browse/constituent lists and reduced-motion
settings. Selection does not trigger application actions: your application owns
data loading, authorization, navigation and persistence. See the
[API reference](API.md) for data recovery, errors, events, configuration defaults
and state continuity.

## Distribution and documentation

| Path | Contents |
| --- | --- |
| `hg-spatial.js` | Browser entrypoint exposing `HGSpatial.create` |
| `vendor/cytoscape-3.34.3.min.js` | Bundled 2D renderer |
| `vendor/babylon-9.27.1.js` | Bundled 3D renderer |
| `examples/` | HTML examples and their local JavaScript/CSS |
| [API.md](API.md) | Public data, options, methods and events |
| [CHANGELOG.md](CHANGELOG.md) | Published release and later documentation updates |
| [ASSEMBLY.md](ASSEMBLY.md) | Maintainer background and historical artifact records |
| `source/` | Readable corresponding HG source, example source and maintainer tools |
| `licenses/`, [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) | Separate vendor terms and notices |

An npm-compatible
[hg-spatial-data-1.0.0-rc.1.tgz](https://github.com/Hippogriff-LLC/hg-spatial-data-public/releases/download/v1.0.0-rc.1/hg-spatial-data-1.0.0-rc.1.tgz)
is also available as a GitHub release download, with files under `package/`.
The package remains `private: true` and has not been published to the npm registry.
Use the release files directly; this distribution exposes a browser global rather
than ESM/CommonJS imports or a server entrypoint.

The tagged release assets are immutable historical payloads. Documentation and
descriptive package metadata on GitHub `main` have been corrected after publication;
these edits do not change the ZIP/TGZ downloads. `SHA256SUMS` and `PROVENANCE.json`
remain the original assembly records for that payload, not a manifest or current
publication status for the edited `main` tree.

## Integration limits

HG displays supplied coordinates and relationships; it does not provide GIS,
graph layout, inferred links, editing or persistence. Renderers share page globals,
so avoid loading conflicting engine versions. Hierarchy rebuilding and data copying
are synchronous; workload size and update rate affect main-thread responsiveness.
No browser/device certification, WCAG conformance or measured performance budget
is claimed. 2D and 3D may differ in cosmetic fidelity and occlusion.

HG has no data/network loader. Provision scripts locally for offline use. The viewer
inserts styles, so account for that in your host's Content Security Policy. Renderer
availability and host policy affect rendering; when a renderer is unavailable,
the controller retains data browsing and inspection with `renderStatus: 'unavailable'`.

## License

HG Spatial Data is [MIT licensed](LICENSE), copyright 2026 Hippogriff Technology LLC.
The bundled Cytoscape.js (MIT) and Babylon.js (Apache-2.0) files carry their separate
licenses and notices in `licenses/` and [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
