import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { AssetRenderer, PANEL_ASSET_THEMES, type RenderedAsset } from '@autoserver/assets';
import { SERVER_PULSE_STATES, VISUAL_THEME_KEYS } from '@autoserver/visual-system';

const out = resolve('.tmp/generated-assets');
const renderer = new AssetRenderer(out);
const commandTheme = {
  name: 'command-bridge', eyebrow: 'Discord Auto Server Platform', title: 'Command Bridge',
  subtitle: 'One setup surface. Every server system. Live, auditable, recoverable.',
};
const publicDir = resolve('apps/dashboard/public/assets');
const panelDir = resolve(publicDir, 'panels');
await mkdir(panelDir, { recursive: true });

const generated: RenderedAsset[] = [];
const panelGenerated: RenderedAsset[] = [];
const banner = await renderer.renderBanner('command-bridge-banner', commandTheme);
const motion = await renderer.renderAnimatedPulse('command-bridge-motion', commandTheme);
generated.push(banner, motion);
await copyFile(banner.path, resolve(publicDir, 'command-bridge-banner.png'));
await copyFile(motion.path, resolve(publicDir, 'command-bridge-motion.gif'));

const panelBanners = await renderer.renderPanelPack();
for (const asset of panelBanners) {
  generated.push(asset); panelGenerated.push(asset);
  await copyFile(asset.path, resolve(panelDir, basename(asset.path)));
}

for (const key of ['welcome', 'verify', 'ticket', 'report', 'announcement', 'security', 'status', 'gaming-hub', 'tournament', 'trust-center', 'member-care', 'project-lab', 'event-studio', 'content-studio', 'reliability-ops']) {
  const theme = PANEL_ASSET_THEMES[key];
  if (!theme) continue;
  const asset = await renderer.renderAnimatedPulse(`${key}-motion`, theme, true);
  generated.push(asset); panelGenerated.push(asset);
  await copyFile(asset.path, resolve(panelDir, basename(asset.path)));
}


const themeOut = resolve('.tmp/generated-theme-assets');
const themeRenderer = new AssetRenderer(themeOut);
const themePublicDir = resolve(publicDir, 'themes');
await mkdir(themePublicDir, { recursive: true });
const themeGenerated: RenderedAsset[] = [];
for (const themeKey of VISUAL_THEME_KEYS) {
  const pack = await themeRenderer.renderThemePulsePack(themeKey, SERVER_PULSE_STATES);
  for (const asset of pack) {
    themeGenerated.push(asset);
    const rel = relative(themeOut, asset.path);
    const target = resolve(themePublicDir, rel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(asset.path, target);
  }
}
generated.push(...themeGenerated);

const themeManifest = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/generate-assets.ts',
  themes: VISUAL_THEME_KEYS.length,
  states: SERVER_PULSE_STATES.length,
  assets: themeGenerated.map((asset) => {
    const rel = relative(themeOut, asset.path).replaceAll('\\', '/');
    const parts = rel.split('/');
    const file = parts.at(-1) ?? rel;
    const stem = file.replace(/\.(png|gif)$/i, '');
    return {
      file: rel,
      theme: parts[0] ?? '',
      state: stem === 'hero' ? null : stem.startsWith('pulse-') ? stem.slice('pulse-'.length).toUpperCase() : null,
      mode: asset.format === 'gif' ? 'MOTION' : 'STATIC',
      sha256: asset.hash,
      dimensions: [asset.width, asset.height],
      frames: asset.format === 'gif' ? 12 : 1,
      bytes: asset.bytes,
    };
  }).sort((a,b)=>a.file.localeCompare(b.file)),
};
await writeFile(resolve(themePublicDir, 'manifest.json'), `${JSON.stringify(themeManifest, null, 2)}\n`);

const manifest = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/generate-assets.ts',
  assets: panelGenerated
    .map((asset) => ({
      file: basename(asset.path),
      sha256: asset.hash,
      dimensions: [asset.width, asset.height],
      frames: asset.format === 'gif' ? 12 : 1,
      bytes: asset.bytes,
    }))
    .sort((a, b) => a.file.localeCompare(b.file)),
};
await writeFile(resolve(panelDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  generated: generated.map(({ logicalKey, format, width, height, bytes, hash }) => ({ logicalKey, format, width, height, bytes, hash })),
  panelManifestEntries: manifest.assets.length,
  themeAssets: themeGenerated.length,
  themeManifestEntries: themeManifest.assets.length,
}, null, 2));
