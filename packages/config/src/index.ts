import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}, z.boolean());

const optionalUrl = z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional());
const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional());
const optionalSecret32 = z.preprocess((value) => value === '' ? undefined : value, z.string().min(32).optional());
const optionalSigningSecret = z.preprocess((value) => value === '' ? undefined : value, z.string().min(24).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(10000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PROCESS_ROLE: z.enum(['all', 'api', 'bot', 'worker']).default('all'),
  PUBLIC_BASE_URL: optionalUrl,
  DASHBOARD_URL: optionalUrl,
  DASHBOARD_ORIGIN: optionalUrl,
  BOT_ENABLED: booleanFromString.default(false),
  DISCORD_BOT_TOKEN: optionalString,
  DISCORD_APPLICATION_ID: optionalString,
  DISCORD_CLIENT_SECRET: optionalString,
  DISCORD_OAUTH_REDIRECT_URI: optionalUrl,
  DASHBOARD_SESSION_SECRET: optionalSecret32,
  DISCORD_TEST_GUILD_ID: optionalString,
  DISCORD_GUILD_MEMBERS_INTENT: booleanFromString.default(false),
  DISCORD_SHARD_MODE: z.enum(['single','auto','manual']).default('single'),
  DISCORD_SHARD_IDS: optionalString,
  DISCORD_SHARD_COUNT: z.preprocess((value)=>value===''||value===undefined?undefined:value,z.coerce.number().int().min(1).max(1000).optional()),
  DATABASE_URL: optionalString,
  DATABASE_SSL: booleanFromString.default(true),
  DATABASE_SSL_REJECT_UNAUTHORIZED: booleanFromString.default(true),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(8),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(35_000),
  ADMIN_API_KEY: optionalSecret32,
  INTERACTION_SIGNING_SECRET: optionalSigningSecret,
  SUPABASE_URL: optionalUrl,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: z.string().default('autoserver-assets'),
  AUTO_RUN_MIGRATIONS: booleanFromString.default(true),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(1200),
  JOB_LEASE_SECONDS: z.coerce.number().int().min(10).default(30),
  SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(5_000).max(60_000).default(25_000),
  MAX_GUILD_MUTATION_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  ASSET_OUTPUT_DIR: z.string().default('.tmp/assets'),
  PLUGIN_ROOT: z.string().default('plugins/external'),
  EXTERNAL_PLUGINS_ENABLED: booleanFromString.default(false),
  THIRD_PARTY_PLUGINS_ENABLED: booleanFromString.default(false),
  THIRD_PARTY_PLUGIN_SANDBOX_PROFILE: z.enum(['DISABLED','LINUX_NS_SECCOMP_V1']).default('DISABLED'),
  PLUGIN_SANDBOX_HEAP_MB: z.coerce.number().int().min(192).max(2048).default(384),
  PLUGIN_SANDBOX_TMP_MB: z.coerce.number().int().min(1).max(64).default(8),
  PLUGIN_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  PLUGIN_MAX_OUTPUT_BYTES: z.coerce.number().int().min(1024).max(4_194_304).default(262_144),
  AI_EXTERNAL_PROVIDERS_ENABLED: booleanFromString.default(false),
  OPENAI_AI_ENABLED: booleanFromString.default(false),
  OPENAI_API_KEY: optionalString,
  OPENAI_AI_MODEL: optionalString,
  OPENAI_AI_ALLOWED_CAPABILITIES: optionalString,
  OPENAI_AI_ALLOWED_DATA_CLASSES: optionalString,
  OPENAI_AI_MAX_INPUT_BYTES: z.coerce.number().int().min(1024).max(65_536).default(16_384),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }

  if (parsed.data.BOT_ENABLED && (!parsed.data.DISCORD_BOT_TOKEN || !parsed.data.DISCORD_APPLICATION_ID)) {
    throw new Error('BOT_ENABLED=true requires DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID');
  }
  if(parsed.data.DISCORD_SHARD_MODE==='manual'){
    if(!parsed.data.DISCORD_SHARD_COUNT||!parsed.data.DISCORD_SHARD_IDS)throw new Error('DISCORD_SHARD_MODE=manual requires DISCORD_SHARD_COUNT and DISCORD_SHARD_IDS');
    const ids=parsed.data.DISCORD_SHARD_IDS.split(',').map((item)=>Number(item.trim()));
    if(!ids.length||ids.some((id)=>!Number.isInteger(id)||id<0||id>=parsed.data.DISCORD_SHARD_COUNT!))throw new Error('DISCORD_SHARD_IDS must be comma-separated integers within DISCORD_SHARD_COUNT');
    if(new Set(ids).size!==ids.length)throw new Error('DISCORD_SHARD_IDS must not contain duplicates');
  }

  if(parsed.data.THIRD_PARTY_PLUGINS_ENABLED){
    if(!parsed.data.EXTERNAL_PLUGINS_ENABLED)throw new Error('THIRD_PARTY_PLUGINS_ENABLED=true requires EXTERNAL_PLUGINS_ENABLED=true');
    if(parsed.data.THIRD_PARTY_PLUGIN_SANDBOX_PROFILE==='DISABLED')throw new Error('THIRD_PARTY_PLUGINS_ENABLED=true requires an explicit THIRD_PARTY_PLUGIN_SANDBOX_PROFILE');
  }

  if(parsed.data.OPENAI_AI_ENABLED){
    if(!parsed.data.AI_EXTERNAL_PROVIDERS_ENABLED)throw new Error('OPENAI_AI_ENABLED=true requires AI_EXTERNAL_PROVIDERS_ENABLED=true');
    if(!parsed.data.OPENAI_API_KEY||!parsed.data.OPENAI_AI_MODEL)throw new Error('OPENAI_AI_ENABLED=true requires OPENAI_API_KEY and OPENAI_AI_MODEL');
    if(!parsed.data.OPENAI_AI_ALLOWED_CAPABILITIES||!parsed.data.OPENAI_AI_ALLOWED_DATA_CLASSES)throw new Error('OPENAI_AI_ENABLED=true requires explicit capability and data-class allowlists');
    if(!/^[A-Za-z0-9._:-]{1,160}$/.test(parsed.data.OPENAI_AI_MODEL))throw new Error('OPENAI_AI_MODEL contains unsupported characters');
    const capabilityValues=new Set(['AUDIT_SUMMARY','ERROR_EXPLANATION','TICKET_SUMMARY','TEMPLATE_RECOMMENDATION','PERMISSION_FIX_SUGGESTION','ANALYTICS_SUMMARY']);
    const dataClassValues=new Set(['PUBLIC','OPERATIONAL','ANALYTICS','USER_CONTENT','AUDIT','SECURITY']);
    const capabilities=parsed.data.OPENAI_AI_ALLOWED_CAPABILITIES.split(',').map((item)=>item.trim().toUpperCase()).filter(Boolean);
    const dataClasses=parsed.data.OPENAI_AI_ALLOWED_DATA_CLASSES.split(',').map((item)=>item.trim().toUpperCase()).filter(Boolean);
    if(!capabilities.length||capabilities.some((value)=>!capabilityValues.has(value)))throw new Error('OPENAI_AI_ALLOWED_CAPABILITIES contains an unsupported capability');
    if(!dataClasses.length||dataClasses.some((value)=>!dataClassValues.has(value)))throw new Error('OPENAI_AI_ALLOWED_DATA_CLASSES contains an unsupported or forbidden data class');
  }

  return parsed.data;
}

export { evaluateDurableDeploymentProfile, type DeploymentProfileInput, type DurableDeploymentProfileSummary } from './deployment-profile-pure.ts';
