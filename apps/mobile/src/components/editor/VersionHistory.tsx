import { describeChange, diffWorkout } from '@lift/domain/workoutDiff';
import type { WorkoutVersion } from '@lift/domain/workouts';
import {
  exerciseSlots,
  formatPrescription,
  formatRestSeconds,
  restSlotSeconds,
  totalSets,
} from '@lift/domain/workouts';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';

type Props = {
  /** Newest first, as `useWorkout` returns them. */
  versions: readonly WorkoutVersion[];
  currentVersion: number;
};

function formatDate(iso: string | null): string {
  if (iso === null) return 'saving…';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The published versions, newest first. Opening one shows what changed from
 * the version before it, worked out by `diffWorkout` as on publish, and the
 * snapshot's own exercises.
 *
 * Always the snapshot, never the live workout: that is what keeps a session
 * logged against v1 readable after v3 (§2.5). A renamed workout's old
 * versions read under the name they had.
 */
export function VersionHistory({ versions, currentVersion }: Props) {
  const palette = usePalette();
  const [open, setOpen] = useState<number | null>(null);

  if (versions.length === 0) {
    return (
      <Text style={[styles.small, { color: palette.dimmed }]}>
        No versions published yet. Publishing snapshots the workout so sessions logged against it
        stay readable after you edit it.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {versions.map((version, position) => {
        const expanded = open === version.versionNumber;
        const exercises = exerciseSlots(version.slots).length;
        // The next-older version, or null for the first publish.
        const previous = versions[position + 1] ?? null;

        return (
          <View key={version.versionNumber} style={[styles.item, { borderColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => {
                setOpen(expanded ? null : version.versionNumber);
              }}
              style={styles.header}
            >
              <View style={styles.titleRow}>
                <Text style={[styles.version, { color: palette.text }]}>
                  v{String(version.versionNumber)}
                </Text>
                {version.versionNumber === currentVersion ? (
                  <Text
                    style={[styles.tag, { color: palette.accent, borderColor: palette.accent }]}
                  >
                    current
                  </Text>
                ) : null}
                <Text style={[styles.small, styles.date, { color: palette.dimmed }]}>
                  {formatDate(version.createdAt)} {expanded ? '▴' : '▾'}
                </Text>
              </View>
              <Text
                style={[styles.body, { color: palette.text }]}
                numberOfLines={expanded ? undefined : 2}
              >
                {version.changeSummary === '' ? 'No summary' : version.changeSummary}
              </Text>
              <Text style={[styles.small, { color: palette.dimmed }]}>
                {exercises === 1 ? '1 exercise' : `${String(exercises)} exercises`} ·{' '}
                {String(totalSets(version))} sets
              </Text>
            </Pressable>

            {expanded ? (
              <View style={styles.detail}>
                <Text style={[styles.label, { color: palette.text }]}>
                  {previous === null
                    ? 'First version'
                    : `Changes from v${String(previous.versionNumber)}`}
                </Text>
                {diffWorkout(previous, version).changes.map((change, index) => (
                  <Text key={String(index)} style={[styles.small, { color: palette.text }]}>
                    • {describeChange(change)}
                  </Text>
                ))}

                <Text style={[styles.label, { color: palette.text }]}>{version.name}</Text>
                {version.slots.length === 0 ? (
                  <Text style={[styles.small, { color: palette.dimmed }]}>No exercises.</Text>
                ) : (
                  version.slots.map((slot) => (
                    <View key={slot.slotId} style={styles.slot}>
                      <Text
                        style={[styles.small, styles.slotName, { color: palette.text }]}
                        numberOfLines={1}
                      >
                        {slot.kind === 'rest' ? 'Rest' : slot.exerciseName}
                      </Text>
                      <Text style={[styles.small, { color: palette.dimmed }]}>
                        {slot.kind === 'rest'
                          ? formatRestSeconds(restSlotSeconds(slot))
                          : formatPrescription(slot.prescription)}
                      </Text>
                    </View>
                  ))
                )}
                <Text style={[styles.small, { color: palette.dimmed }]}>
                  A snapshot: editing the workout never changes it.
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  item: { borderWidth: 1, borderRadius: 10 },
  header: { padding: 10, gap: 4, minHeight: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  version: { fontSize: 15, fontWeight: '700' },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  date: { marginLeft: 'auto' },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 13 },
  label: { fontSize: 14, fontWeight: '600', paddingTop: 4 },
  detail: { paddingHorizontal: 10, paddingBottom: 10, gap: 4 },
  slot: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  slotName: { flex: 1 },
});
