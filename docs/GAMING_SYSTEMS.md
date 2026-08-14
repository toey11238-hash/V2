# Gaming Platform Domain

Gaming is a first-class domain, not a channel preset. It remains strictly non-wagering.

## Kernel areas

- Game Registry and capability-driven adapter descriptors.
- Player Gaming Profiles with visibility policy.
- LFG state machine: OPEN / FILLING / FULL / PLAYING / FINISHED / CANCELLED / EXPIRED.
- Party state machine with owner transfer and future temporary-voice binding.
- Team roster validation and Captain/Co-Captain/Member/Substitute/Coach roles.
- Clan/Guild roster validation and Leader/Officer/Member/Recruit roles.
- Recruitment surfaces in Gaming blueprints.
- Scrim validation: future date, odd best-of, distinct teams, no wagering/stake fields.
- Tournament lifecycle and deterministic single-elimination seed pairing primitive.
- Match lifecycle: scheduled -> ready -> active -> result -> review/dispute -> completed.
- Match score consistency validation and evidence hooks.
- XP policy with per-event cap, cooldown and hourly anti-farming cap.
- Quest progress driven by real event type matches.
- Achievement qualification primitive and persistence schema.
- Seasonal progression with bounded levels.
- Game news/status/integration capability layer.
- Guides, clips/highlights and coaching persistence foundations.

## Database surfaces

See migrations `002_gaming.sql` and `005_gaming_expansion.sql` for guild games, profiles, LFG, teams, clans, tournaments, matches, quests, achievements, parties, scrims, XP, seasons, game integrations, guides/media and coaching sessions.

## Safety invariant

Tournament and scrim configuration is validated in code and constrained in PostgreSQL so `wageringEnabled` and `entryStakeRequired` cannot be enabled by these competition records. No betting, casino or wagering workflow belongs in this domain.
