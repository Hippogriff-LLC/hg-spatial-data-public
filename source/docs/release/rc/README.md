# HG Spatial Data — 1.0.0-rc.1

Local release-candidate documentation. Assembly is currently blocked; no downloadable
RC or published package exists. The project LICENSE is MIT, copyright 2026
Hippogriff Technology LLC. The npm identifier `hg-spatial-data`
is a preferred placeholder pending authoritative registry verification.

HG Spatial Data is a vanilla-JavaScript browser viewer for preloaded 2D/3D points and
explicit relationships. It provides selection, clustering, bundles, inspection,
focus/Back navigation and live updates while preserving source IDs. Consumers own
data, authorization, actions and persistence. No framework, consumer build step,
backend, telemetry or source-data upload is required. GIS, graph layout, semantic
link inference, editing, persistence and framework wrappers are outside V1.

## Local installation and quick start

After a candidate has been assembled and reviewed, unpack the static ZIP and copy its
directory to your static host. The npm-compatible TGZ contains identical files under
`package/`. Existing npm consumers may install the local tarball using
`npm install --ignore-scripts --offline ./hg-spatial-data-1.0.0-rc.1.tgz` and copy
the asset directory from `node_modules/hg-spatial-data` into their static host.
These filenames are prospective until assembly succeeds. No registry install or CDN
is live. npm is optional. This is a browser asset package, with no named ESM exports,
CommonJS API, SSR entrypoint or supplied TypeScript declarations.

The assembled `examples/2d.html` and `examples/3d.html` provide local numeric examples,
live updates, target/reduced-motion settings and explicit mode switching. Each loads
only its initial renderer; the consumer host example provisions the other local
engine on the user's switch action. These are staged examples awaiting real execution.

Load only the renderer required by the selected mode, then HG. For zero-option 2D:

```html
<div id="map" style="height:520px;width:100%"></div>
<script src="./vendor/cytoscape-3.34.3.min.js"></script>
<script src="./hg-spatial.js"></script>
<script>
const viewer = HGSpatial.create(document.getElementById('map'), {
  points: [{id:'west', x:0, y:2}, {id:'east', x:10, y:6}],
  relationships: [{id:'signal', source:'west', target:'east'}]
});
// Call viewer.destroy() when removing this view.
</script>
```

The host supplies a connected, empty, sized container. Invalid construction throws
before mounting; temporary zero size retains state and waits for measurable dimensions.

For 3D use `vendor/babylon-9.27.1.js` instead of Cytoscape and supply finite Z on all
points, including zero. Auto chooses 3D for a nonempty all-Z dataset; otherwise 2D.
Data updates retain the resolved mode. Explicit 3D places missing Z at zero with a
diagnostic, or rejects it with `view.missingZ:'reject'`. To switch modes, provision the
other local renderer before `viewer.setOptions({view:{mode:'2d'}})` or `'3d'`.
An explicit `'auto'` re-evaluates the current dataset. Do not preload Babylon for a
2D-only page. Engines share page globals; avoid loading conflicting versions. HG never
downloads a missing engine or silently changes mode. The private `HGSpatialDefault`
compatibility global is outside the consumer contract.

## Data, options and updates

Supply `{points, relationships?}` with exact nonempty string IDs and finite numeric
X/Y, optional Z, and explicit ID-based relationships. Proximity never creates links.
Self-links, parallel relationships and absent endpoints retain identity. Metadata is
plain JSON copied on ingestion/access. Labels/metadata are text. Normalize source
dates/categories yourself; axes describe formatting without transforming coordinates.
Ordinary invalid records recover with diagnostics; duplicate IDs reject atomically.

[API.md](API.md) gives the complete schema, 14 configuration groups, exact defaults
and ranges, merge/reset semantics, snapshots, all 14 methods, five events, errors and
continuity rules. Constructor options then runtime patches recursively merge; arrays
replace, false is preserved and null resets to built-in defaults. Unknown/invalid
options reject the whole patch. Record cosmetics override group styles, followed by
selection highlighting. Options are per viewer.

```js
const stop = viewer.on('selectionchange', event => {
  const selected = event.payload.selection;
  if (selected) document.getElementById('details').textContent = selected.originalIds.join(', ');
});
viewer.applyChanges({points:[{id:'east', x:12}]});
viewer.setOptions({accessibility:{targetSize:'large', reducedMotion:'always'}});
// Host cleanup: stop(); viewer.destroy();
```

The second snippet assumes a host-owned `details` element. Getters observe current
logical state; queued event snapshots describe their own revision. Events are ordered
datachange, selectionchange, focuschange, diagnostics, viewchange when affected. No
automatic Open/edit/navigation business action follows selection.

## Errors, input and accessibility

Catch `HGSpatialError` and branch on `code`/`path`, never parse its explanatory message.
Recoverable warnings appear in diagnostics; missing renderer/WebGL retains controller,
browse and inspection in `renderStatus:'unavailable'`. Supply the renderer, then use
Try again or explicitly request its mode. No automatic 2D downgrade occurs.

Tab reaches controls and browse/constituent lists. Stage arrows navigate objects;
Enter focuses aggregates/reveals originals; Escape clears; Backspace goes Back;
`+`/`-` zoom; `F`/`0` fit. Fit preserves focus; Reset returns to whole data and clears
selection/history. Touch supports pan/pinch and 3D orbit; use surrounding page space
for page scroll/zoom. Crowded/co-located originals remain available through lists.
Set an informative accessibility label. System reduced motion is respected; `'always'`
disables camera animation. `'large'` requests 44 CSS px toolbar targets and enlarged
node picking. Custom themes need contrast review. Screen-reader, touch, visible-focus
and responsive Human QA remain required; no WCAG conformance is claimed.

## Offline, CSP, privacy and support status

Keep HG, selected renderer assets, corresponding source, licenses and notices together.
Offline means locally provisioned files; a warm vendor cache is insufficient. Expected
HG requests are local script provisioning only; HG itself has no data/network loader.
Real vendor outbound-request and cold-cache offline verification are still blocked.
No vendor auxiliary runtime asset has yet been verified unnecessary.

The viewer inserts a stylesheet and style properties. A candidate CSP to test is:

```text
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none';
base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'
```

This is an unverified test policy, not a demonstrated directive minimum. Host scripts
should be separate local files under that policy. No nonce option or eval exception
is promised. Required directives must be determined with actual pinned vendors; never
broaden script policy just to hide unexplained violations.

Never treat metadata as trusted HTML or authorization in a custom inspector. Limit
untrusted workload size/update rate: copying and hierarchy rebuilding are synchronous
and can stall the main thread. Bounded source scans cannot certify security. Vendor
package, embedded license and current advisory review remain incomplete.

| Target | Current RC evidence |
| --- | --- |
| Chrome/Chromium desktop | BLOCKED: browser execution and local vendor staging unavailable |
| Edge desktop | NOT AVAILABLE |
| Firefox desktop | BLOCKED: binary available, no governed RC runtime session |
| Safari macOS | NOT AVAILABLE |
| Chrome Android | BLOCKED: real-device Human RC QA pending |
| Safari iOS/iPadOS | NOT AVAILABLE: no actual device session |

These are verification states, not support promises. All are intended current-stable
targets. Headless Chromium or emulated touch cannot replace physical-device acceptance.
3D requires working WebGL; unavailable-state browsing remains the baseline fallback.
No real-browser density/performance budget is established for this RC.

## Versioning, source and license

SemVer applies to the accepted HG public API. `1.0.0-rc.1` is a local prerelease;
`1.0.0` publication needs separate authorization. Future deprecations identify a
replacement and migration path; public breaking changes require a major release.
Initial consumers use HGSpatial, with no migration from private development globals.
Do not persist opaque aggregate IDs across versions. Pin HG and renderer versions;
upgrade deliberately and repeat offline, API and browser QA. Immutable releases are
replaced by a new fixed version, never overwritten.

[CHANGELOG.md](CHANGELOG.md) records this candidate. The HG LICENSE contains the full MIT
terms, copyright 2026 Hippogriff Technology LLC. Cytoscape.js 3.34.3 uses MIT;
Babylon.js 9.27.1 uses Apache-2.0. Complete shipped license/NOTICE inventory is pending
actual package inspection. Third-party terms apply separately. Assembly will include
readable corresponding HG source and [ASSEMBLY.md](ASSEMBLY.md), plus retained vendor
texts and notices, before any candidate can be emitted. No public source destination
or publication action is currently authorized.
