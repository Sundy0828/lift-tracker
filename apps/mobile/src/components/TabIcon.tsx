import type { ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * The web's bottom-nav glyphs (`BottomNav.tsx`), on the same 24-unit grid and
 * stroke, drawn in the tab's own colour.
 */

export type TabName = 'today' | 'workouts' | 'history' | 'settings';

function Glyph({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function TabIcon({ name, color }: { name: TabName; color: string }) {
  switch (name) {
    case 'today':
      return (
        <Glyph color={color}>
          {/* The web's <rect x="3.25" y="5" width="17.5" height="15.5" rx="2.5">. */}
          <Path d="M5.75 5h12.5a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5H5.75a2.5 2.5 0 0 1-2.5-2.5V7.5A2.5 2.5 0 0 1 5.75 5z" />
          <Path d="M8 3v4M16 3v4M3.25 10h17.5" />
          <Circle cx={12} cy={15.25} r={1.5} fill={color} stroke="none" />
        </Glyph>
      );
    case 'workouts':
      return (
        <Glyph color={color}>
          <Path d="M9 6.5h11.5M9 12h11.5M9 17.5h11.5" />
          <Circle cx={4.5} cy={6.5} r={1.25} fill={color} stroke="none" />
          <Circle cx={4.5} cy={12} r={1.25} fill={color} stroke="none" />
          <Circle cx={4.5} cy={17.5} r={1.25} fill={color} stroke="none" />
        </Glyph>
      );
    case 'history':
      return (
        <Glyph color={color}>
          <Circle cx={12} cy={12} r={8.5} />
          <Path d="M12 7v5.25l3.5 2" />
        </Glyph>
      );
    case 'settings':
      return (
        <Glyph color={color}>
          <Path d="M3.25 7.5h4M11.75 7.5h9" />
          <Circle cx={9.5} cy={7.5} r={2.25} />
          <Path d="M3.25 16.5h8.5M16.75 16.5h4" />
          <Circle cx={14.5} cy={16.5} r={2.25} />
        </Glyph>
      );
  }
}
