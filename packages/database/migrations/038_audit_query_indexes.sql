BEGIN;

CREATE INDEX IF NOT EXISTS idx_audit_guild_action_time ON audit_events(guild_id,action,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_guild_result_time ON audit_events(guild_id,result,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_guild_resource_time ON audit_events(guild_id,resource_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(correlation_id,created_at DESC);

COMMIT;
