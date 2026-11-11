# HG Spatial Data 1.0.0-rc.1 API reference

This describes the implemented HGSpatial contract. See README.md for provisioning,
input/accessibility guidance and the pending RC verification limits.

`HGSpatial.create(container, data, options?)` returns a synchronous controller.
The container must be a connected empty HTML element with no active viewer.
The host owns sizing; zero size waits for layout. Invalid construction leaves no residue.

## Public data contract

Use normalized numeric coordinates plus declarative axis descriptions, with consumer-side plain JavaScript mapping. No built-in arbitrary accessors, field-path language, date parsing, category discovery or layout engine. This bounded combination keeps records easy to validate, copy and update while describing temporal/numeric/categorical meaning explicitly.

`Data = {points: Point[], relationships?: Relationship[]}`. `points` is required, `relationships` defaults to `[]`; no other top-level data keys. Axis descriptions belong to options and survive dataset replacement.

| Record field | Type and meaning |
| --- | --- |
| `Point.id` | Required nonempty string, exact and case-sensitive; no trimming, coercion or generated substitute. |
| `Point.x`, `Point.y` | Required finite numbers. Units and meaning belong to the consumer. |
| `Point.z` | Optional finite number or `null`; absent/null means missing. `0` is real data. |
| `Point.label` | Optional string; omitted or empty uses the ID. Display abbreviation never changes this value. |
| `Point.category` | Optional string, descriptive only. Does not automatically affect position, grouping, color or links. |
| `Point.style` | Optional `{color?: Color, size?: number}`. Size is a finite CSS-pixel diameter in `[4,64]`. |
| `Point.metadata` | Optional JSON object, default `{}`; see copying rules below. |
| `Relationship.id` | Required nonempty string, unique within relationships. |
| `Relationship.source`, `target` | Required nonempty point-ID strings. No endpoint coercion. |
| `Relationship.label`, `metadata` | Same rules as points. |
| `Relationship.type` | Optional descriptive string, without automatic grouping/styling. |
| `Relationship.direction` | Optional `"forward"` (default, source to target), `"both"`, or `"none"`. Reverse direction is represented by swapping endpoints. |
| `Relationship.style` | Optional `{color?: Color, width?: number}`; finite CSS-pixel width in `[0.5,8]`. |

IDs are unique per kind; a point and a relationship may share the same string. Every reference includes a kind, so source IDs may contain punctuation, including `cluster:`. Never split a public reference on a delimiter. Changing an ID is remove plus add. Normalize numeric source IDs to strings explicitly, avoiding collisions between `1` and `"1"`.

Metadata permits nested plain JSON objects/arrays, strings, finite numbers, booleans and null. No functions, DOM nodes, Dates, undefined, cycles or class instances. Input is copied; mutations to caller objects after a call have no effect. Output snapshots are detached copies. Metadata is never interpreted as HTML, a URL/action, authorization or a relationship. The built-in inspector renders bounded text rows; full metadata remains accessible through `getObject`. Aggregates have no invented metadata: consumers retrieve constituents by their original IDs. Unknown record fields are ignored with a diagnostic; put application fields in `metadata`. Invalid optional label/category/type/style/metadata fields are omitted with diagnostics; the valid identity/coordinates still survive.

Default record recovery skips malformed records: skip points missing a valid ID/X/Y; skip relationships missing ID or endpoint strings; duplicate point IDs or duplicate relationship IDs are identity errors: `create` and `replaceData` reject the entire operation atomically with `duplicate-id`. Invalid non-null Z becomes missing with a diagnostic. Invalid-only input displays the empty state and skipped count. An absent endpoint is different from a malformed endpoint: retain that relationship, expose `status: "absent-endpoint"`, and do not draw it or invent its endpoint. It becomes drawable if both endpoints later exist. Self-links retain their ID and loop semantics; parallel IDs remain distinct and separately inspectable. These recovery rules also apply to complete records in replacement data.

`Color` throughout this reference is exactly an opaque six-digit `#RRGGBB` hexadecimal string (case-insensitive). No CSS variables, URLs, gradients, alpha or renderer material objects.

### Coordinates and descriptions

Coordinates stay linear. Axis `format` controls labels, never converts records. `"number"` uses supplied units; `"day"` is a numeric day index; `"date"` is epoch milliseconds displayed in UTC; `"time"` is fractional hours since midnight with explicit day offsets outside 0–24; `"category"` uses a consumer-supplied ordered string array with integer coordinates `0..length-1`. Date values outside the JavaScript Date range and category coordinates outside that index range remain numeric, with a formatting diagnostic. Do not infer a timezone, categorical order or source-data unit.

```js
const source = [{key: 'sample-a', east: 12, north: 8, lane: 'lower'}];
const lanes = ['lower', 'upper']; // Consumer-owned ordering.
const data = {
  points: source.map(row => ({
    id: row.key, x: row.east, y: row.north,
    z: lanes.indexOf(row.lane), metadata: {lane: row.lane}
  })),
  relationships: []
};
// Consumer validates unknown lanes before supplying data.
```

Auto chooses 3D only for a nonempty valid point set where every point has Z, including all-zero Z. Otherwise it chooses 2D. `view.mode: "2d"` always projects X/Y and keeps original Z available for inspection. Explicit 3D with missing Z places it on Z=0 and reports missing/mixed-Z diagnostics. `view.missingZ: "reject"` instead rejects any transaction whose resulting resolved mode is 3D and contains missing Z; this opt-in never rejects a 2D projection.

To preserve current update continuity, auto resolves at construction and when `setOptions` explicitly supplies `view.mode` (including `"auto"` or a null reset). Ordinary data updates keep the resolved mode, even if Z completeness changes. Returning to auto explicitly re-evaluates the current data. Empty initial auto stays 2D until such a request. This policy makes a live stream unable to flip the renderer unexpectedly.

## Configuration model

Options are a closed tree of plain objects. The table lists the entire V1 tree. All groups/leaves are optional. Boolean leaves accept only booleans. `builtin` in the table is explanatory shorthand for the built-in value/behavior, **not** an input string.

| Group | Exact keys, accepted values and defaults |
| --- | --- |
| `view` | `mode: "auto" | "2d" | "3d"` = `"auto"`; `missingZ: "zero" | "reject"` = `"zero"`; `aspect: "adaptive" | "equal"` = `"adaptive"`. |
| `axes` | `visible: boolean` = true; `grid: boolean` = true; `x`, `y`, `z`: axis-description objects specified below. |
| `labels` | `points: "auto" | "selected" | "none"` = `"auto"`; `relationships: "selected" | "none"` = `"selected"`. Aggregate counts have their own settings. |
| `legend` | `visible: boolean` = true. Key follows the actual visible kinds, selection, context and chosen appearance. |
| `controls` | `visible`, `zoom`, `fit`, `reset`: booleans = true; `status: boolean` = true. Back remains available whenever focused. |
| `theme` | Color leaves `background`, `text`, `muted`, `selected`, `related`, `context`, `axis`, `grid` = builtin palette. |
| `points` | `color: Color` = `#0e7c86`; `size: number` in `[4,64]` = 12. Circular 2D / sphere-like 3D glyphs; custom shapes deferred. |
| `relationships` | `color: Color` = `#8792a6`; `width: "auto" | number` in `[0.5,8]` = `"auto"`; `directionCues: boolean` = true. Auto retains accepted thin strokes and density fading. |
| `clusters` | `color: Color` = `#3e5ba9`; `size: "auto" | number` in `[12,96]` = `"auto"`; `counts: boolean` = true. Auto retains count-based size and halo. |
| `bundles` | `color: Color` = `#9aa7ba`; `width: "auto" | number` in `[0.5,12]` = `"auto"`; `counts: boolean` = true. Auto retains count-based width and density fading. Direction cues follow `relationships.directionCues`. |
| `lod` | `density: "default" | "coarser" | "finer"` = `"default"`; `bundleBy: "endpoints" | "direction-type"` = `"endpoints"`. |
| `interaction` | `selection`, `focus`, `pan`, `zoom`, `orbit`: booleans = true. These govern user gestures/keyboard/UI, not programmatic methods. |
| `inspection` | `visible: boolean` = true; `metadata: boolean` = true. Built-in selection details may be hidden for a consumer-supplied panel. The accessible browse/constituent path and data diagnostics remain available. |
| `accessibility` | `label: string` = `"Spatial data view"` (nonempty); `reducedMotion: "system" | "always"` = `"system"`; `targetSize: "default" | "large"` = `"default"`. No forced animation over a system preference. |

Each axis description accepts `name: string` (default axis letter), `unit: string` (default empty), `format: "number" | "day" | "date" | "time" | "category"` (default `"number"`), and `categories: string[]` (default `[]`). Nonempty unit is valid only with number format. Category format requires a nonempty array of distinct nonempty labels; other formats require empty categories. Name/unit are text, abbreviated only in presentation. Z descriptions remain stored in 2D. Hiding axes or grid does not change coordinates or inspector values; `axes.visible: false` suppresses guide text/lines, with grid controlled independently.

The theme defaults are `background: "#fbfcfe"`, `text: "#1f2937"`, `muted: "#6b7485"`, `selected: "#d6336c"`, `related: "#ec8fb0"`, `context: "#c3c9d3"`, `axis: "#aeb7c4"`, and `grid: "#edf0f4"`, matching the inspected palette. Other internal tokens retain their accepted values and are not independently configurable.

`view.aspect: "adaptive"` preserves the accepted shared aspect adjustment and extra responsive 2D stretching for noncommensurate axes. `"equal"` uses equal scale per numeric coordinate unit on all axes and disables those adjustments; the consumer must ensure units are commensurate. Neither changes originals. Axis descriptions/format can affect adaptive fit, so they are not purely cosmetic. Axis adjustment remains explained in data notes. Nonlinear scales, arbitrary projections and numeric axis-scale factors are deferred.

Density presets keep built-in zoom-driven LOD: coarser doubles the accepted projected clustering-radius target; finer halves it. Hysteresis and nested deterministic membership remain. No disable-LOD switch. The default retains the accepted per-mode projection adjustment; equivalent semantics do not promise identical memberships for different viewports or 2D versus 3D projection. Co-located points may stay clustered at maximum zoom and remain individually reachable through constituents.

Endpoint bundling retains the accepted unordered visible-endpoint grouping, with direction summaries, internal loops and sorted constituent relationship IDs. `direction-type` additionally partitions by direction relative to a canonically ordered endpoint pair and exact relationship type (missing type is its own partition). Forward, reverse, both and undirected are distinct partitions; self-links use their declared direction. It never creates relationships. All drawable in-scope original relationships appear exactly once, individually or in one bundle. Bundles retain all parallel IDs. Metadata/category never drives clustering.

Point/relationship record styles override their group color/size/width, followed by selection and related-object highlighting. Aggregate styles come from cluster/bundle options, not whichever constituent happens to be first. Category palettes are supplied explicitly through record styles; automatic category color assignment is deferred. Hiding direction cues does not alter direction, summaries or inspector text. Color/size choices cannot shrink the accepted picking tolerance. Large targets raise minimum toolbar targets to 44 CSS px and node picking radius to at least 28 CSS px, retaining overlap cycling and the browse list.

`controls.visible: false` hides the optional zoom/Fit/Reset group; status is independent. User focus always retains Back and its keyboard/zoom-out escape, even with other controls hidden. Disabling selection blocks new user selection/clear gestures but keeps existing/programmatic selection inspectable. Disabling focus prevents new user drill-down, never Back/Reset. Pan/zoom/orbit flags cover their gesture, keyboard and toolbar equivalents; orbit is inert in 2D. Fit/Reset remain available unless their controls are hidden. Keyboard access, safe text rendering, diagnostics and constituent identity are not optional reliability settings.

Implementation details include renderer styles/materials, camera FOV/angles, scene units, clustering depth/radius numeric tuning, hash implementation, label packing budgets, hysteresis thresholds, animation duration, DPR, mesh strategy and picking algorithms. No generic `rendererOptions` passthrough.

## Precedence, merging and runtime options

1. Start with accepted built-in defaults.
2. Recursively merge constructor options.
3. Recursively merge each successful `setOptions(patch)` into the stored result in call order.
4. Resolve record styles and transient highlights as described above; these do not mutate stored options or data.

Absent keys and `undefined` mean no override, including at construction; explicit false is always honored where a boolean is allowed. Arrays replace whole arrays, never concatenate. A null option leaf resets that leaf to the built-in default; a null group resets its entire subtree. Null never means inherit the original constructor value. `setOptions(null)` resets all options and explicitly re-resolves auto mode. `{}` is a no-op. Resets are validated against the complete resulting tree: for example resetting only categories while retaining category format fails. These option-null rules do not apply to records: `z: null` means missing; record-patch null rules appear below.

Unknown option keys, wrong types/enums/ranges, non-plain objects and invalid combinations reject the whole construction/update with an exact path; no partial merge. Recognized keys with `undefined` are omitted, but unknown keys are errors even when their value is undefined. Dictionaries must be processed as own keys without prototype mutation. No HTML `data-*`, URL query, global mutable defaults or CSS-as-configuration API in V1. Current example `data-*`/query handling is harness code, not an implicit public configuration layer.

Options are per instance. Cosmetic changes keep camera, selection, focus and history. Aspect, axis descriptions, LOD policy or resolved mode can rebuild representation but must follow continuity rules. Changes to chrome can resize the stage and follow resize continuity. No runtime option mutates source relationships, source IDs or record coordinates.

## Object references, snapshots and instance methods

`Ref = {kind: "point" | "relationship" | "cluster" | "bundle", id: string}`. Source references resolve throughout the retained dataset, even when not drawn. Aggregate references resolve in the current LOD/focus model (including offscreen model objects), not arbitrary prior models. Aggregate IDs are opaque and deterministic for identical kind/membership within a library version; no cross-version persistence or collision ambiguity is allowed. Constituent arrays are unique and sorted by exact JavaScript string order, independent of input order. Counts equal array lengths.

`getObject(ref)` returns null for an unresolved reference, otherwise one of these detached snapshots:

- Point: `{kind: "point", id, record: Point}`.
- Relationship: `{kind: "relationship", id, record: Relationship, status: "drawable" | "absent-endpoint", selfLink: boolean}`.
- Cluster: `{kind: "cluster", id, count, pointIds: string[]}`.
- Bundle: `{kind: "bundle", id, count, relationshipIds: string[], pointIds: string[], ends: [Ref, Ref], directionCounts: {forward, backward, both, none, internal}}`. Counts are nonnegative integers, mutually exclusive and sum to count; internal counts all relationships whose represented endpoints coincide. Exact directions/types of internal members remain in their source snapshots. Ends are point/cluster refs sorted by kind then ID and do not claim to be source endpoints.

Snapshot records contain sanitized public fields only: label fallback, metadata `{}`, missing Z `null`, and relationship direction `"forward"` are materialized. Other omitted optional fields remain absent; computed styles and renderer coordinates are never written into `record`.

`Selection = {target: Ref, originalIds: string[], representedBy: Ref[]}`; null means cleared. Originals are point IDs for point/cluster targets and relationship IDs for relationship/bundle targets. `representedBy` describes the current model, not screen occlusion. It can be empty for an absent endpoint, outside-focus object or unavailable representation. The selected target/constituents remain inspectable through zoom even if its old aggregate is no longer present. Single selection only in V1.

`State` is exactly `{revision, mode, renderStatus, selection, focus, canGoBack, view, visible, diagnostics}`:

- `revision`: nonnegative integer, increases once per committed state-changing operation or coalesced gesture; initial state is 0. No-op calls do not increment it.
- `mode`: resolved `"2d" | "3d"`; `renderStatus`: `"ready" | "waiting-size" | "unavailable"`.
- `focus`: null or `{target: Ref, pointIds: string[], relationshipIds: string[]}`. Cluster focus has empty relationshipIds; bundle focus records its original relationships and endpoint points.
- `view`: `{center: {x: number, y: number, z: number | null}, zoom: number, automaticFit: boolean, lod: "overview" | "mid" | "detail" | "focus"}`. Center is in original coordinate units; Z is null in 2D; zoom is positive relative to whole-data fit. Empty center is `{x:0,y:0,z:null}` in 2D and Z=0 in 3D. No engine camera object or writable camera serialization is promised.
- `visible`: `{points: number, relationships: number, clusters: number, bundles: number}` counts current in-scope model objects, not on-screen pixels. Faint outside-focus context is excluded.
- `diagnostics`: current `Diagnostic[]` as defined below. Returned state is a detached read-only-by-contract observation, not an importable persistence format.

All methods are synchronous, commit logical state before return, and never return a Promise. Painting/animation occurs afterward; state reports the committed camera destination during animation. A later operation starts from the current displayed camera and supersedes pending motion. Events are queued as specified below. Unless stated otherwise, methods return `undefined` and invalid arguments throw `HGSpatialError` without altering state.

Rejected operations emit no events and leave prior diagnostics unchanged. Successful operations that change only diagnostics still commit a revision and emit diagnostics/viewchange; fully unchanged operations emit nothing. Listener registration/unsubscription is not a view-state revision.

| Method | Inputs, result and continuity |
| --- | --- |
| `replaceData(data)` | Replaces the dataset; missing relationships means empty. Returns `{diagnostics: Diagnostic[]}` for this operation. Options persist; valid selection/focus/camera follow continuity below. |
| `applyChanges(changes)` | Incremental transaction below; same return as replacement. No implicit endpoint deletion cascade. |
| `setOptions(patch)` | Merge/reset options atomically; preserves state as described. Returns `{diagnostics: Diagnostic[]}` for the operation. |
| `fit()` | Frames current focus or whole data, preserving selection/focus/history. Re-enters automatic fit in whole-data scope. |
| `reset()` | Fits whole current dataset, clears selection/focus/history and restores automatic fit. Retains options and resolved mode; does not reload data. |
| `focus(ref)` | Current cluster/bundle only; frames its points and pushes history. Does not select a different object. Same current focus is a no-op. Stale target throws `target-not-found`; point/relationship kind throws `invalid-argument`. |
| `back()` | Returns boolean: false if no prior scope, otherwise true. Restores prior scope/framing with selection continuity below. |
| `select(refOrNull)` | Select source or current aggregate; null clears. No camera motion or implicit focus. Stale/unknown target throws `target-not-found`. Selecting identical unchanged selection is a no-op. |
| `reveal(ref)` | Point/relationship only; brings it into individual view where spatially possible, without changing selection. Exits incompatible focus and clears its history. No present endpoint throws `target-not-drawable`; with one endpoint frames it and reports absent endpoint. Co-located originals remain accessible through constituents. |
| `zoomBy(factor)` | Positive finite factor; zooms around current view center, bounded by internal navigation limits. Preserves selection; sufficiently far zoom-out exits focus continuously. Useful for external controls. |
| `getObject(ref)` | Detached snapshot or null; no motion, selection, events or state change. Malformed reference throws. |
| `getState()` | Detached State, including selection, diagnostics and view inspection; no renderer objects. |
| `on(type, listener)` | Event type below plus function; returns an idempotent `unsubscribe()` function. No wildcard, callback option or DOM-event duplicate mechanism. |
| `destroy()` | Idempotent; stops animations, observers, handlers and engines, cancels pending event delivery, removes owned DOM and releases data/listener references. |

No public `setMode`, `setZoom`, `render`, `adapter`, `data`, `view`, scene, mesh or graph-element property. Use `setOptions({view:{mode:...}})` and snapshots. No class/subclass contract.

### Incremental transaction

`Changes = {points?: PointPatch[], relationships?: RelationshipPatch[], removePointIds?: string[], removeRelationshipIds?: string[]}`; only these keys. Patches require ID, shallow-merge supplied fields for existing IDs, and insert full valid records for new IDs. Omitted/undefined fields preserve existing values. Metadata and style replace whole values rather than recursively merge. Null on optional label/category/type/style/metadata/direction deletes the override and uses its default; null Z means missing. Required ID/X/Y/endpoints cannot be deleted.

Removal arrays are processed first, then upserts. Repeated removal IDs are harmless; unknown removal IDs are no-ops. Duplicate upsert IDs reject the entire transaction with `duplicate-id`; an ID in both removal and upsert for the same kind rejects the entire transaction with `conflicting-change`, avoiding order-dependent partial patches. Malformed envelope/patch identity also rejects. Each malformed new record is skipped with a diagnostic; a malformed update to an existing record leaves that record unchanged and diagnoses it. Invalid optional fields follow record recovery. Validate the completed candidate dataset and options before commit; `missingZ: "reject"` rejects the whole transaction. Endpoint status is calculated after all changes, so simultaneous endpoint additions work.

## Events

One mechanism: `viewer.on(type, listener)`. Callbacks receive detached snapshots and run in registration order. Construction queues initial `diagnostics` (if any) then `viewchange` in a microtask, so immediate registration after `create` observes them. Other operations queue events after logical commit; callbacks never run in the middle of mutation. Each committed revision keeps its own ordered event batch. A listener-triggered mutation queues a later batch; it cannot change the earlier event snapshots. Camera gestures coalesce to at most one view batch per animation frame, plus final settled state. Rendering animation frames alone do not mint semantic revisions.

Envelope: `{type, revision, source, reason, payload}`. `source` is `"api" | "pointer" | "touch" | "keyboard" | "control" | "system"`; toolbar/browse/inspector actions are control, direct stage gestures use their modality. `reason` is one of `"mount"`, `"select"`, `"clear"`, `"focus"`, `"back"`, `"zoom-out"`, `"fit"`, `"reset"`, `"reveal"`, `"zoom"`, `"pan"`, `"orbit"`, `"resize"`, `"replace-data"`, `"apply-changes"`, `"set-options"`, `"renderer"`. A batch uses the triggering reason; do not substitute renderer event names. No raw native event, engine object or consumer metadata is implicitly logged.

| Type | Exact payload and trigger |
| --- | --- |
| `datachange` | `{points: number, relationships: number, diagnostics: Diagnostic[]}` after a changed dataset commits. Counts are retained originals, including absent-endpoint relationships. |
| `selectionchange` | `{previous: Selection | null, selection: Selection | null}` when target, constituents, representation or the selected source record changes. Clearing is the same event with selection null. IDs let listeners call `getObject`; metadata is obtained explicitly there. |
| `focuschange` | `{previous: State.focus, focus: State.focus, canGoBack: boolean}` on entering/leaving/changing scope or repairing history after updates. |
| `diagnostics` | `{diagnostics: Diagnostic[]}` for operation warnings or changed environmental diagnostics, including an empty array when cleared. |
| `viewchange` | `{state: State}` for mode, camera, size, LOD, visible counts, render status or other committed view changes; emitted once last in an operation batch. |

Order for a transaction: datachange, selectionchange, focuschange, diagnostics, viewchange, omitting unchanged/not-applicable events. Unsubscribing prevents subsequent invocation, including queued callbacks; subscriptions added during dispatch start with later batches. Callback exceptions cannot roll back committed state or interrupt other listeners; report through the browser's ordinary error mechanism without attaching records. No recursive diagnostic event for a callback error.

V1 defers an `open`/edit/action-request API. Accepted Enter/double-tap means focus for aggregates and reveal for originals; it must not unexpectedly open a URL. Consumers can render an Open button from selection IDs/metadata, then handle navigation/authorization themselves. Selection is not consent to a business mutation.

## Updates and state continuity

- **Ordinary camera movement/LOD:** original selections keep original IDs, recomputing representedBy. An aggregate selection keeps its captured sorted constituents through zoom; representations may become multiple objects or another aggregate. It does not become a different application record.
- **Replace/incremental update:** original selection survives while that ID is retained, including a now-undrawable relationship. Removed/skipped-on-replacement selected originals clear. Aggregate selection retains surviving constituents only if an exact current aggregate membership matches; otherwise it clears. The internal singleton-aggregate case may resolve to its original when unchanged. Do not silently select an arbitrary survivor or broaden membership. Emit selectionchange for record-content updates even when the ID survives.
- **Focus/history:** cluster scopes retain surviving point IDs; bundle scopes retain surviving relationship IDs and their currently present endpoints. Newly added unrelated points do not enter a captured scope. Within a focus all supplied drawable relationships between its points remain visible, not only the originally focused bundle. Reconcile every history entry against the new data; drop empty/unresolvable scopes, discard cached hierarchies, and recompute constituents. If current focus becomes empty, return to the nearest valid ancestor, otherwise whole data. This does not promise stale renderer-state restoration.
- **Back:** restore the previous valid framing/scope. Keep a currently valid selection made inside focus; if it no longer resolves, restore the valid pre-focus selection, otherwise clear. Explicit Back restores saved framing; gesture/zoomBy exit preserves the camera reached by zoom-out and returns one scope. Fit keeps focus/history; Reset clears both.
- **Moved coordinates/new bounds:** automatic-fit views refit their scope. User-moved views retain data-space center, relative zoom and 3D orientation where valid; they do not track a selected record automatically. Recompute LOD, apply navigation limits if necessary, diagnose a clamp, and repair representation. Resize follows the same automatic-fit/user-camera distinction.
- **Option changes:** palette/labels/details changes cannot alter source or aggregate membership. Aspect, axis descriptions and LOD changes can rebuild the hierarchy and reconcile aggregate selection using the same rule as data updates. Resolved mode changes fit the retained scope with that mode's accepted camera, preserve original selections and valid focus, and clear incompatible camera history; a whole-data return entry remains available when focused. Report focus/history changes. Default runtime style updates never reset the camera.

When no points remain, enter the accepted empty view, clear point focus/history and use the empty center/fit; retained absent-endpoint relationships can still be selected/inspected. No hidden filtering or source edits are implied by visibility, focus, clustering, inspection or missing endpoints.

## Errors, diagnostics and renderer independence

Thrown `HGSpatialError` extends Error with `name: "HGSpatialError"`, `code: string`, `path: string` and `message: string`. Path is a dotted/indexed argument path such as `options.points.size` or `changes.points[0].id`, empty for lifecycle errors. Messages are human-readable, not stable machine keys, and must not embed metadata. Consumers branch on code. No Promise rejection channel.

| Case | Contract |
| --- | --- |
| Invalid/nonempty/occupied/detached container | Fatal `invalid-container` or `container-in-use`, no residue. |
| Invalid Data envelope (including null), option or method arguments | `invalid-data`, `invalid-options` or `invalid-argument`; reject without mutation. `{points:[]}` is valid. |
| Unknown option / out-of-range option / invalid combination | `invalid-options` with the precise path; never silently ignore. |
| Duplicate point/relationship IDs in `create`/`replaceData`, or duplicate upsert IDs in `applyChanges` | `duplicate-id`; reject the whole operation atomically with no state change. |
| Malformed complete records, invalid optional fields/Z | Recover as defined above; diagnostic codes `invalid-point`, `invalid-relationship`, `invalid-field`, `invalid-z`, `unknown-field`. |
| Incremental conflicts / missing-Z reject policy | `conflicting-change` / `missing-z`; reject transaction. |
| Missing/mixed Z, absent endpoints, display-format mismatch | Recoverable `missing-z`, `mixed-z`, `absent-endpoint`, `axis-format` diagnostics; source truth stays intact. |
| Stale reference / reveal without any drawable endpoint | `target-not-found` / `target-not-drawable`; no motion. |
| Missing renderer or failed WebGL/context | `renderer-unavailable` diagnostic, renderStatus unavailable, records and built-in browse path retained. No automatic 2D downgrade. |
| Zero-size container / necessary navigation clamp | `container-hidden` / `view-clamped` diagnostic; state retained or adjusted as described. |
| Calls after destroy | All methods except destroy throw `destroyed`; previously returned unsubscribe functions remain harmless. |

`Diagnostic = {code: string, severity: "warning", path: string, kind?: "point" | "relationship", id?: string, message: string}`. ID is included only when valid. It never contains a raw record. Operation return values include that operation's complete warning list. State diagnostics retain the last data-ingestion warnings until the next data operation and combine them with current derived data/options/environment warnings; resolved warnings disappear. Events report that resulting combined list. No unbounded accumulation or telemetry.

An unavailable renderer can be retried via the built-in Try again control after the required local asset/capability becomes available; this is the same renderer, not a new semantic mode. Programmatic `setOptions` with an explicit `view.mode` retries that mode even when unchanged. There is no automatic script download/CDN fallback. Other logical methods work in unavailable/waiting-size state; graphical work waits for capability/size, and emits viewchange on recovery.

Source semantics, event shapes, selection identity, constituent counts and update rules are identical across renderers. Circular discs versus spheres, pixel widths in perspective, antialiasing, arrow geometry and occlusion can differ. Basic color/size requests are interpreted as visual targets; inability to match a non-default cosmetic request closely uses the nearest supported appearance and a deduplicated `cosmetic-approximation` diagnostic per option/mode. Routine antialiasing and perspective differences need no warning. Never silently omit selection, direction meaning or constituent disclosure to accommodate rendering. This design does not claim new option combinations have passed visual/accessibility QA.

