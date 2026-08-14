import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '@autoserver/config';
import { DashboardSessionRepository, type DashboardGuildAccess, type DashboardSessionRecord, type Database } from '@autoserver/database';

const SESSION_COOKIE = 'autoserver_session';
const OAUTH_NONCE_COOKIE = 'autoserver_oauth_nonce';
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;

function cookieMap(request: FastifyRequest): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of (request.headers.cookie ?? '').split(';')) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    out.set(pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim()));
  }
  return out;
}

function signature(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function signed(secret: string, value: string): string {
  return `${value}.${signature(secret, value)}`;
}

function verifySigned(secret: string, token?: string): string | null {
  if (!token) return null;
  const index = token.lastIndexOf('.');
  if (index <= 0) return null;
  const value = token.slice(0, index);
  const provided = Buffer.from(token.slice(index + 1));
  const expected = Buffer.from(signature(secret, value));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return value;
}

function cookieOptions(config: AppConfig, maxAgeSeconds: number): string {
  const secure = config.NODE_ENV === 'production';
  return `Path=/; HttpOnly; ${secure ? 'Secure; SameSite=None;' : 'SameSite=Lax;'} Max-Age=${maxAgeSeconds}`;
}

function clearCookie(config: AppConfig): string {
  return `Path=/; HttpOnly; ${config.NODE_ENV === 'production' ? 'Secure; SameSite=None;' : 'SameSite=Lax;'} Max-Age=0`;
}

export interface DiscordOAuthUser { id: string; username: string; global_name?: string | null; avatar?: string | null; }
interface DiscordGuild { id: string; name: string; icon?: string | null; owner?: boolean; permissions: string; }
interface DiscordTokenResponse { access_token: string; token_type: string; expires_in: number; scope: string; }

export function oauthReady(config: AppConfig, database: Database): boolean {
  return Boolean(database.configured && config.DISCORD_APPLICATION_ID && config.DISCORD_CLIENT_SECRET && config.DISCORD_OAUTH_REDIRECT_URI && config.DASHBOARD_SESSION_SECRET);
}

export function buildDiscordLogin(config: AppConfig, reply: FastifyReply): string {
  if (!config.DISCORD_APPLICATION_ID || !config.DISCORD_OAUTH_REDIRECT_URI || !config.DASHBOARD_SESSION_SECRET) throw new Error('Discord OAuth is not configured');
  const nonce = randomBytes(18).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const state = signed(config.DASHBOARD_SESSION_SECRET, `${nonce}:${issuedAt}`);
  reply.header('set-cookie', `${OAUTH_NONCE_COOKIE}=${encodeURIComponent(nonce)}; ${cookieOptions(config, 600)}`);
  const url = new URL(DISCORD_AUTHORIZE);
  url.searchParams.set('client_id', config.DISCORD_APPLICATION_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.DISCORD_OAUTH_REDIRECT_URI);
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  return url.toString();
}

export function verifyOAuthState(request: FastifyRequest, config: AppConfig, state?: string): boolean {
  if (!config.DASHBOARD_SESSION_SECRET) return false;
  const decoded = verifySigned(config.DASHBOARD_SESSION_SECRET, state);
  if (!decoded) return false;
  const [nonce, issuedText] = decoded.split(':');
  const cookieNonce = cookieMap(request).get(OAUTH_NONCE_COOKIE);
  const issuedAt = Number(issuedText);
  return Boolean(nonce && cookieNonce === nonce && Number.isFinite(issuedAt) && Math.abs(Math.floor(Date.now() / 1000) - issuedAt) <= 600);
}

export async function exchangeDiscordCode(config: AppConfig, code: string): Promise<{ user: DiscordOAuthUser; guilds: DashboardGuildAccess[] }> {
  if (!config.DISCORD_APPLICATION_ID || !config.DISCORD_CLIENT_SECRET || !config.DISCORD_OAUTH_REDIRECT_URI) throw new Error('Discord OAuth is not configured');
  const body = new URLSearchParams({
    client_id: config.DISCORD_APPLICATION_ID,
    client_secret: config.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.DISCORD_OAUTH_REDIRECT_URI,
  });
  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!tokenResponse.ok) throw new Error(`Discord OAuth token exchange failed (${tokenResponse.status})`);
  const token = await tokenResponse.json() as DiscordTokenResponse;
  const headers = { authorization: `${token.token_type} ${token.access_token}` };
  const [userResponse, guildResponse] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, { headers }),
    fetch(`${DISCORD_API}/users/@me/guilds`, { headers }),
  ]);
  if (!userResponse.ok || !guildResponse.ok) throw new Error('Discord OAuth profile/guild fetch failed');
  const user = await userResponse.json() as DiscordOAuthUser;
  const guilds = (await guildResponse.json() as DiscordGuild[]).filter((guild) => {
    const bits = BigInt(guild.permissions || '0');
    return Boolean(guild.owner || (bits & MANAGE_GUILD) === MANAGE_GUILD || (bits & ADMINISTRATOR) === ADMINISTRATOR);
  }).map((guild) => ({ guildId: guild.id, name: guild.name, icon: guild.icon ?? null, permissions: guild.permissions, owner: Boolean(guild.owner) }));
  return { user, guilds };
}

export async function issueDashboardSession(input: { request: FastifyRequest; reply: FastifyReply; config: AppConfig; database: Database; user: DiscordOAuthUser; guilds: DashboardGuildAccess[] }): Promise<DashboardSessionRecord> {
  if (!input.config.DASHBOARD_SESSION_SECRET) throw new Error('DASHBOARD_SESSION_SECRET is required');
  const sessionId = randomUUID();
  const csrfToken = randomBytes(24).toString('base64url');
  const record = await new DashboardSessionRepository(input.database).create({
    sessionId,
    userId: input.user.id,
    userProfile: { ...input.user },
    guildAccess: input.guilds,
    csrfToken,
    ttlHours: 8,
  });
  const token = signed(input.config.DASHBOARD_SESSION_SECRET, sessionId);
  input.reply.header('set-cookie', [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(input.config, 8 * 3600)}`,
    `${OAUTH_NONCE_COOKIE}=; ${clearCookie(input.config)}`,
  ]);
  return record;
}

export async function readDashboardSession(request: FastifyRequest, config: AppConfig, database: Database): Promise<DashboardSessionRecord | null> {
  if (!config.DASHBOARD_SESSION_SECRET || !database.configured) return null;
  const signedId = cookieMap(request).get(SESSION_COOKIE);
  const sessionId = verifySigned(config.DASHBOARD_SESSION_SECRET, signedId);
  if (!sessionId) return null;
  return new DashboardSessionRepository(database).get(sessionId);
}

export async function destroyDashboardSession(request: FastifyRequest, reply: FastifyReply, config: AppConfig, database: Database): Promise<void> {
  if (config.DASHBOARD_SESSION_SECRET && database.configured) {
    const signedId = cookieMap(request).get(SESSION_COOKIE);
    const sessionId = verifySigned(config.DASHBOARD_SESSION_SECRET, signedId);
    if (sessionId) await new DashboardSessionRepository(database).delete(sessionId).catch(() => undefined);
  }
  reply.header('set-cookie', `${SESSION_COOKIE}=; ${clearCookie(config)}`);
}

export function sessionCanManageGuild(session: DashboardSessionRecord | null, guildId: string): boolean {
  return Boolean(session?.guildAccess.some((guild) => guild.guildId === guildId));
}
