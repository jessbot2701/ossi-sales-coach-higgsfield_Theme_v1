import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const assetPath = join(process.cwd(), 'public', 'assets', 'hero-final.webp');
const mobileVideoPath = join(process.cwd(), 'public', 'assets', 'ossi-hero-mobile.mp4');

describe('Ossi production asset', () => {
  it('ships an optimized valid WebP image', () => {
    expect(existsSync(assetPath)).toBe(true);
    expect(statSync(assetPath).size).toBeLessThan(700_000);

    const bytes = readFileSync(assetPath);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('ships a compact mobile hero video', () => {
    expect(existsSync(mobileVideoPath)).toBe(true);
    expect(statSync(mobileVideoPath).size).toBeLessThan(1_000_000);

    const bytes = readFileSync(mobileVideoPath);
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
  });
});
