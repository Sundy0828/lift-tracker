import type { Overlay } from '@lift/domain/overlay';
import { daysBetween, localDateKey } from '@lift/domain/sessions';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';

/**
 * Where last time's numbers came from. Same rules as the web's `OverlayLine`:
 * tier 1 (this workout's own history) is stated plainly; tier 2 (the same lift
 * on another day) is labelled with where it came from and tagged
 * `reference`, because it is a hint at a load, not a comparison.
 */

function describeSource(name: string, workoutId: string | null): string {
  if (workoutId === null) return 'an ad-hoc session';
  return name.trim() === '' ? 'an unnamed workout' : name;
}

/** "Aug 26", or "today" / "yesterday" when that reads better. */
function relativeDate(dateKey: string): string {
  const days = daysBetween(dateKey, localDateKey());
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';

  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  const formatted = new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return year === new Date().getFullYear() ? formatted : `${formatted}, ${String(year)}`;
}

export function OverlayLine({ overlay, workoutName }: { overlay: Overlay; workoutName: string }) {
  const palette = usePalette();

  if (overlay.kind === 'new') {
    return (
      <Text style={[styles.text, { color: palette.dimmed }]}>
        {overlay.doneElsewhere
          ? 'First time on this workout — a different day is not a comparison.'
          : 'First time — no history to compare against yet.'}
      </Text>
    );
  }

  const date = relativeDate(overlay.data.performedOn);
  const primary = overlay.kind === 'same-workout';
  const source = primary
    ? describeSource(workoutName, overlay.data.workoutId)
    : describeSource(overlay.data.workoutName, overlay.data.workoutId);

  // Only the name may shrink, so the date (the part being read for) stays whole.
  return (
    <View style={styles.line}>
      <Text style={[styles.text, { color: primary ? palette.text : palette.dimmed }]}>
        {primary ? 'Last ' : 'From '}
      </Text>
      <Text
        style={[styles.text, styles.name, { color: primary ? palette.text : palette.dimmed }]}
        numberOfLines={1}
      >
        {source}
      </Text>
      <Text style={[styles.text, { color: primary ? palette.text : palette.dimmed }]}>
        {' '}
        · {date}
      </Text>
      {primary ? null : (
        <Text
          style={[styles.tag, { color: palette.dimmed, borderColor: palette.border }]}
          accessibilityHint="Not this workout's own history. Shown to suggest a load, not compared against."
        >
          reference
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center' },
  text: { fontSize: 13 },
  name: { flexShrink: 1 },
  tag: {
    fontSize: 11,
    marginLeft: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
});
