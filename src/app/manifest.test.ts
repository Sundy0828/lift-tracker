import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { manifest } from './manifest';

/**
 * The installability criteria, which Lighthouse no longer checks.
 *
 * Version 12 dropped the PWA category and its audits, so nothing else in the
 * pipeline notices if the app stops being installable — and the symptom is
 * silent: the browser just never offers to install, on a product whose offline
 * story depends on it (§2.8).
 */
describe('web app manifest', () => {
  it('has the fields a browser requires to offer an install', () => {
    expect(manifest.name).not.toBe('');
    expect(manifest.short_name).not.toBe('');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('has a 192px and a 512px icon', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('has a maskable icon, so the installed icon is not letterboxed', () => {
    const maskable = manifest.icons.filter((icon) => 'purpose' in icon);
    expect(maskable.map((icon) => icon.sizes)).toContain('512x512');
  });

  it('points every icon and shortcut at a file that exists', () => {
    const shortcutIcons = manifest.shortcuts.flatMap((shortcut) => shortcut.icons);
    for (const { src } of [...manifest.icons, ...shortcutIcons]) {
      const path = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
      expect(existsSync(path), `${src} is missing from public/`).toBe(true);
    }
  });

  it('keeps every shortcut inside the app scope', () => {
    for (const { url } of manifest.shortcuts) {
      expect(url.startsWith(manifest.scope)).toBe(true);
    }
  });
});
