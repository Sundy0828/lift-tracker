import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { friendUrl } from '@/features/sharing/shareLink';

/**
 * Your friend code as a QR, drawn as inline SVG.
 *
 * **It encodes a URL, not the bare code.** A phone's own camera opens a link
 * it recognises, so the other person points their camera at this and lands on
 * a screen with your code already filled in — no scanner in the app, no camera
 * permission, and nothing to install. Scanning inside a PWA would mean a
 * decoder, `getUserMedia`, and a permission prompt, to end up in the same
 * place.
 *
 * SVG rather than a canvas so it stays sharp at any size and needs no ref, no
 * device-pixel-ratio arithmetic and no redraw on resize.
 */

/** Error correction level. `M` survives a phone screen's glare and a thumb. */
const CORRECTION = 'M';

/** Quiet zone, in modules. Below four, scanners start missing it. */
const MARGIN = 4;

export function FriendQr({ code, size = 168 }: { code: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, CORRECTION);
    qr.addData(friendUrl(code));
    qr.make();

    const count = qr.getModuleCount();
    const parts: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) {
          parts.push(`M${String(column + MARGIN)} ${String(row + MARGIN)}h1v1h-1z`);
        }
      }
    }
    return { d: parts.join(''), extent: count + MARGIN * 2 };
  }, [code]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(path.extent)} ${String(path.extent)}`}
      role="img"
      aria-label={`QR code for friend code ${code}`}
      data-testid="friend-qr"
      shapeRendering="crispEdges"
    >
      {/* A white ground under the code whatever the colour scheme: a scanner
          needs the contrast, and dark mode would otherwise invert it. */}
      <rect width={path.extent} height={path.extent} fill="#ffffff" />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}
