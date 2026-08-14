# ASSET REGISTRY

Status: deterministic bundled media pipeline IMPLEMENTED / TESTING; remote publish/rollback and live storage verification remain incomplete.

## Bundled project assets
- `apps/dashboard/public/assets/command-bridge-banner.png` — Command Bridge static brand banner.
- `apps/dashboard/public/assets/command-bridge-motion.gif` — ambient Command Bridge motion fallback.
- `apps/dashboard/public/assets/panels/` — **103** current managed panel PNG/GIF media entries plus `manifest.json` with SHA-256, dimensions, frame count and byte size.
- `apps/dashboard/public/assets/themes/` — **230** theme media files plus `manifest.json`: 10 themes × (1 hero + 11 static pulse PNG + 11 animated pulse GIF).

## Phase 27 visual identity
Built-in themes: Command Bridge, Aurora Grid, Royal Signal, Soft Lab, Arena Core, Obsidian Luxe, Celestial, Sakura Circuit, Tactical and Minimal Mono.

Every Server Pulse state (`IDLE`, `ACTIVE`, `READY`, `LIVE`, `SUCCESS`, `WATCH`, `DEGRADED`, `INCIDENT`, `MAINTENANCE`, `SYNCING`, `RECOVERY`) has both static and animated media in every theme. This prevents CINEMATIC/ANIMATED policy from resolving to a missing asset.

New managed visual panel media: `theme-studio.png`, `asset-gallery.png`, `role-gallery.png`, `server-pulse.png`, `server-pulse-motion.gif`, `scene-presets.png`.

## Runtime strategy
1. `packages/visual-system` supplies the canonical visual tokens/state colors to both code renderers and the offline fallback generator.
2. The canonical dependency-backed renderer uses Sharp/SVG and supports nested logical output paths.
3. The checked-in fallback generator uses Pillow only when the dependency graph cannot be installed; it reads theme tokens from the TypeScript visual source rather than maintaining a second palette.
4. Panel definitions reference stable repo-relative asset keys; Canon asset-reference audit fails when a referenced bundled file is missing.
5. Dashboard honors `prefers-reduced-motion`; Discord animated media always has readable text and static fallback.
6. Local filesystem storage remains development-oriented; Supabase Storage is an optional durable deployment adapter when explicitly configured.
7. Content hashes/manifests prevent needless republish and provide byte-level evidence.
8. Missing remote storage/configuration falls back to bundled immutable media instead of a broken external URL.

## Verification boundary
- Current managed panel definitions: **87**.
- Current panel manifest: **103** media files.
- Current theme manifest: **230** media files.
- Phase 27 media/hash gate: PASS through `test:phase27-visual-experience`.
- Canon asset-reference audit: source/static only.
- Live Supabase upload/version/rollback/CDN failure tests: NOT RUN.
- Production Sharp generator execution remains dependency-blocked by QA-003.

## Phase 28 prismatic-depth asset governance
- Current governed visual set: **333 media files** = 103 panel assets + 230 theme assets.
- The checked-in offline generator uses the `prismatic-depth-v2` visual grammar with crystal/hologram depth, orbit/particle structures and Thai source metadata; it is resumable/deterministic and manifests are rebuilt from actual final bytes/hashes rather than predeclared output.
- Animated GIF assets carry frame evidence (current generated motion assets use at least 12 frames where animation is expected) and every operational surface retains readable static/text fallback.
- Theme/panel asset titles and embedded visible badges/pulse labels are Thai source-of-truth; path/logical keys remain stable technical identifiers.
- Phase 28 source/hash evidence does not prove remote CDN delivery, production Sharp generation or deployed decode/GPU cost.

## Phase 29 asset note
- Phase 29 introduces no disconnected media pack. Digital Twin, Operations Intelligence and Event Replay use the existing Phase 28 governed web visual language and CSS/runtime primitives; governed visual media corpus remains 333 files (103 panel + 230 theme).
