import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const assetPath = join(process.cwd(), 'public', 'assets', 'hero-final.webp');

describe('Ossi production asset', () => {
  it('ships an optimized valid WebP image', () => {
    expect(existsSync(assetPath)).toBe(true);
    expect(statSync(assetPath).size).toBeLessThan(700_000);

    const bytes = readFileSync(assetPath);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });
});
