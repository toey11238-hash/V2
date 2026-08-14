# Phase 27 — Total Visual Experience Overhaul

Phase 27 converts the platform visual layer from a collection of themed panels into a coherent, state-aware product identity named **Omni Command Nexus**. The signature element is **Server Pulse**: an orbital/signal visual whose state comes from durable runtime evidence rather than a timer.

## Visual catalog
Ten built-in theme packs share one semantic token contract while retaining distinct motifs: Command Bridge, Aurora Grid, Royal Signal, Soft Lab, Arena Core, Obsidian Luxe, Celestial, Sakura Circuit, Tactical and Minimal Mono. Five scene presets (Calm, Balanced, Showcase, Live, Operations) compose existing setup fields rather than creating hidden configuration.

## Discord experience
Visual-enabled blueprints add a restricted `88・VISUAL EXPERIENCE` fabric with Theme Studio, Asset Gallery, Role Gallery, Server Pulse, Scene Presets and a visual preview voice room. Five new managed Components V2 panels use stable message identity and the same repair/versioning model as the rest of the platform.

Role appearance is capability-aware. Enhanced colors require Discord guild feature `ENHANCED_ROLE_COLORS`; role icon/emoji intent requires `ROLE_ICONS`. Unsupported capability is normalized to a stable fallback and never grants permission.

## Living panels
Migration 054 authors durable `panel_live_states` and `panel_live_state_events`. Runtime events from setup, security, maintenance, restore, backup, integrations, scheduler and Gaming can update the affected managed panel. Event IDs are de-duplicated durably, state survives restart, TTL can return it to IDLE, and Discord edits are coalesced instead of emitted every second.

## Media factory
The bundled theme pack contains 230 theme media files: each of 10 themes has one hero plus PNG and GIF Server Pulse media for all 11 states. A separate theme manifest records SHA-256, dimensions, frames and bytes for every file. The panel pack currently contains 103 managed media entries, including Theme Studio, Asset Gallery, Role Gallery, Server Pulse and Scene Presets.

The dependency-backed canonical renderer remains Sharp/SVG. Because this environment still lacks the reviewed dependency graph, an offline Pillow fallback generated the checked-in visual assets from the same visual token source; this is source/media evidence, not proof that the production build generator ran.

## Dashboard
Dashboard adds Theme Studio, scene presets, capability chips, Server Pulse and Live Server Map. `prefers-reduced-motion` disables non-essential CSS motion. A guild-scoped `/visual-experience` endpoint exposes setup-safe visual configuration, Discord visual capabilities and durable living-panel state without secrets or private member availability.

## Verification boundary
`test:phase27-visual-experience` verifies 1069 pure/source/media assertions. UI V2 smoke reports 415 Omni resources, 87 managed panels and 103 panel media assets. Migration 054, live Components V2 messages, role enhanced-color/icon behavior, actual Discord rate-limit behavior and deployed browser rendering remain unverified until approved targets are used.
