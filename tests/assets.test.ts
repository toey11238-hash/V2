import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AssetRenderer } from '@autoserver/assets';

const theme = { name: 'test', eyebrow: 'Auto Server', title: 'Command Bridge', subtitle: 'Event-backed control' };

describe('asset renderer', () => {
  it('renders deterministic PNG and animated GIF outputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'autoserver-assets-'));
    const renderer = new AssetRenderer(dir);
    const png = await renderer.renderBanner('banner', theme);
    const gif = await renderer.renderAnimatedPulse('motion', theme);
    expect(png.bytes).toBeGreaterThan(1000);
    expect(gif.bytes).toBeGreaterThan(1000);
    expect(png.hash).toHaveLength(64);
    expect(gif.format).toBe('gif');
  }, 30_000);
});
