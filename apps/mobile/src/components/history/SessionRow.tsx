import {
  formatDayLabel,
  formatElapsed,
  formatSetCount,
  formatVolumeLoad,
  sessionDurationSeconds,
  sessionTotals,
} from '@lift/domain/history';
import type { Session } from '@lift/domain/sessions';
import type { Unit } from '@lift/domain/types';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { Badge, Card } from '../ui';
import { usePush } from '../../navigation';

/** Opens a past session's detail, once per tap (see `usePush`). */
export function useOpenSession(): (sessionId: string) => void {
  const push = usePush();
  return (sessionId) => {
    push({ pathname: '/history/session/[sessionId]', params: { sessionId } });
  };
}

/** One past session in a list: what, when, how long, how much. Opens its detail. */
export function SessionRow({ session, displayUnit }: { session: Session; displayUnit: Unit }) {
  const openSession = useOpenSession();
  const palette = usePalette();
  const totals = sessionTotals(session);
  const seconds = sessionDurationSeconds(session);

  return (
    <Card
      testID="history-session"
      onPress={() => {
        openSession(session.id);
      }}
    >
      <View style={styles.row}>
        <View style={styles.text}>
          <View style={styles.title}>
            <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>
              {session.workoutName === '' ? 'Ad-hoc session' : session.workoutName}
            </Text>
            {session.status === 'abandoned' ? <Badge label="abandoned" /> : null}
          </View>
          <Text style={[styles.small, { color: palette.dimmed }]}>
            {formatDayLabel(session.performedOn)}
            {seconds === null ? '' : ` · ${formatElapsed(seconds)}`}
            {totals.restSeconds === 0 ? '' : ` · ${formatElapsed(totals.restSeconds)} resting`}
            {session.workoutVersion === null ? '' : ` · v${String(session.workoutVersion)}`}
          </Text>
        </View>
        <View style={styles.numbers}>
          <Text style={[styles.count, { color: palette.text }]}>{formatSetCount(totals.sets)}</Text>
          {totals.volumeLoadKg > 0 ? (
            <Text style={[styles.small, styles.tabular, { color: palette.dimmed }]}>
              {formatVolumeLoad(totals.volumeLoadKg, displayUnit)}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  numbers: { alignItems: 'flex-end', gap: 2 },
  count: { fontSize: 14, fontVariant: ['tabular-nums'] },
  small: { fontSize: 12, lineHeight: 17 },
  tabular: { fontVariant: ['tabular-nums'] },
});
