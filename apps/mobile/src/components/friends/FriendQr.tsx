import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { friendUrl } from '../../links';

/**
 * Your friend code as a QR: the web's `FriendQr`, same encoder and settings.
 *
 * **It encodes the web URL, not the bare code.** Any phone camera opens a link
 * it recognises: into this app where it is installed (app links), and into the
 * web app where it is not. So there is no scanner here and no camera
 * permission, and the other person needs nothing installed.
 */

/** Error correction. `M` survives a phone screen's glare and a thumb. */
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

  // A whole number of points per module. A fractional one leaves hairline
  // seams between modules where the edges are antialiased (react-native-svg
  // has no crispEdges), and a scanner reads seams as noise.
  const drawn = Math.max(1, Math.floor(size / path.extent)) * path.extent;

  return (
    <Svg
      testID="friend-qr"
      width={drawn}
      height={drawn}
      viewBox={`0 0 ${String(path.extent)} ${String(path.extent)}`}
      accessibilityLabel={`QR code for friend code ${code}`}
    >
      {/* White under the code whatever the scheme: a scanner needs the contrast. */}
      <Rect width={path.extent} height={path.extent} fill="#ffffff" />
      <Path d={path.d} fill="#000000" />
    </Svg>
  );
}
