import { useRestCountdown } from '@lift/data/hooks/useRestCountdown';
import type { Rest } from '@lift/data/hooks/useRestTimer';
import { restTotal } from '@lift/data/hooks/useRestTimer';
import { REST_ALERT_LIMIT, REST_ALERT_REPEAT_SECONDS } from '@lift/domain/rest';
import { formatDuration } from '@lift/domain/workouts';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buzz, chime } from '../../alert';
import { restAlarmDenied } from '../../platform';
import { usePalette } from '../../theme';

/**
 * The rest countdown, pinned to the bottom of the session screen.
 *
 * **The ticking lives here**, through `useRestCountdown`, not in the screen
 * that owns the deadline: this is the only thing that changes twice a second,
 * and ticking one level up would re-render every set row at the same rate.
 *
 * Past zero it counts the overrun up, so a rest that ran long says by how much.
 */

type Props = {
  rest: Rest | null;
  withChime: boolean;
  onAdjust: (seconds: number) => void;
  onStop: () => void;
  /** Offers a manual start while no rest runs. Null hides the idle bar. */
  onStart: (() => void) | null;
};

export function RestTimerBar({ rest, withChime, onAdjust, onStop, onStart }: Props) {
  const palette = usePalette();
  const { left, isOver } = useRestCountdown(rest);

  /** The deadline last alerted for, and how many alerts it has raised. */
  const alerted = useRef<number | null>(null);
  const count = useRef(0);

  /**
   * The foreground alert, on the same schedule as the notifications: at the
   * deadline, then every `REST_ALERT_REPEAT_SECONDS`, `REST_ALERT_LIMIT` times.
   * Driven off the elapsed overrun rather than a timer, so returning from the
   * background does not set off a burst. Keyed on the deadline, so extending
   * a rest re-arms it.
   */
  useEffect(() => {
    if (rest === null || !isOver) return;
    if (alerted.current !== rest.endsAt) {
      alerted.current = rest.endsAt;
      count.current = 0;
    }
    if (count.current >= REST_ALERT_LIMIT) return;
    if (-left < count.current * REST_ALERT_REPEAT_SECONDS) return;

    count.current += 1;
    buzz();
    if (withChime) chime();
  }, [rest, isOver, left, withChime]);

  if (rest === null) {
    if (onStart === null) return null;
    return (
      <View style={[styles.bar, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: palette.dimmed }]}>No rest running</Text>
          <BarButton label="Start rest" onPress={onStart} primary />
        </View>
      </View>
    );
  }

  const total = restTotal(rest);
  const elapsed = isOver ? 1 : Math.min(1, Math.max(0, (total - left) / total));

  return (
    <View
      style={[styles.bar, { backgroundColor: palette.surface, borderColor: palette.border }]}
      accessibilityRole="timer"
    >
      <View style={[styles.track, { backgroundColor: palette.border }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${String(elapsed * 100)}%`,
              backgroundColor: isOver ? palette.warn : palette.accent,
            },
          ]}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.readout}>
          <Text
            style={[styles.clock, { color: isOver ? palette.warn : palette.text }]}
            accessibilityLabel={isOver ? 'Rest over' : 'Rest remaining'}
          >
            {isOver ? `+${formatDuration(-left)}` : formatDuration(left)}
          </Text>
          <Text style={[styles.label, { color: palette.dimmed }]} numberOfLines={1}>
            {isOver ? 'over · ' : ''}
            {rest.label}
            {restAlarmDenied() ? ' · notifications off' : ''}
          </Text>
        </View>
        <BarButton
          label="−15s"
          accessibilityLabel="Take 15 seconds off the rest"
          onPress={() => {
            onAdjust(-15);
          }}
        />
        <BarButton
          label="+15s"
          accessibilityLabel="Add 15 seconds to the rest"
          onPress={() => {
            onAdjust(15);
          }}
        />
        <BarButton label={isOver ? 'Done' : 'Skip'} onPress={onStop} primary />
      </View>
    </View>
  );
}

function BarButton({
  label,
  onPress,
  primary = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  accessibilityLabel?: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: palette.accent }
          : { borderColor: palette.border, borderWidth: 1 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonLabel, { color: primary ? palette.onAccent : palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1 },
  track: { height: 4 },
  fill: { height: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'space-between',
  },
  readout: { flex: 1, minWidth: 0 },
  clock: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { fontSize: 13 },
  button: {
    minHeight: 44,
    minWidth: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
