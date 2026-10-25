import { useAllSessions } from '@lift/data/hooks/useAllSessions';
import { useProfile } from '@lift/data/hooks/useProfile';
import { exportFilename, sessionsToCsv, sessionsToJson } from '@lift/domain/export';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Body, Button, Card, Heading, Notice } from '../ui';

/**
 * Getting your training out of the app: the web's `ExportCard`.
 *
 * The same two files from the same functions (`@lift/domain/export`): a CSV of
 * one row per set, and a JSON copy of the session documents. The web
 * downloads them; the phone writes them to its cache and opens the share
 * sheet, which has Save to Files, Drive, mail and the rest.
 *
 * The history is read on demand, not subscribed: holding every session ever
 * logged for the life of Settings would be paid by everyone who never presses
 * Export.
 */
type Format = 'csv' | 'json';

/**
 * Writes the file and opens the share sheet. The two modules are loaded here
 * rather than imported: each throws at import on a build older than the JS,
 * and as static imports they took the whole Settings screen down with them.
 */
async function shareFile(filename: string, contents: string, mimeType: string, uti: string) {
  const modules = await Promise.all([import('expo-file-system'), import('expo-sharing')]).catch(
    () => null,
  );
  if (modules === null) {
    throw new Error('This build of the app cannot export yet. Install the latest build.');
  }
  const [{ File, Paths }, Sharing] = modules;
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: filename });
}

export function ExportCard() {
  const { profile } = useProfile();
  const [wanted, setWanted] = useState<Format | null>(null);
  const { sessions, isPending, complete, error } = useAllSessions(wanted !== null);
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  /** The request already written, so one press cannot share two files. */
  const written = useRef<Format | null>(null);

  // The read starts on the press and the file goes out the moment it lands,
  // so the press is one action rather than press-then-wait.
  useEffect(() => {
    if (wanted === null || isPending || error !== null || written.current === wanted) return;
    written.current = wanted;

    const contents =
      wanted === 'csv' ? sessionsToCsv(sessions, profile.displayUnit) : sessionsToJson(sessions);
    const sent =
      wanted === 'csv'
        ? shareFile(
            exportFilename('csv'),
            contents,
            'text/csv',
            'public.comma-separated-values-text',
          )
        : shareFile(exportFilename('json'), contents, 'application/json', 'public.json');

    void sent.then(
      () => {
        setDone(
          complete
            ? `${String(sessions.length)} sessions exported.`
            : `${String(sessions.length)} most recent sessions exported — there are older ones this could not read in one go.`,
        );
        setWanted(null);
      },
      (cause: unknown) => {
        setFailed(cause instanceof Error ? cause.message : 'The file could not be written.');
        setWanted(null);
      },
    );
  }, [wanted, isPending, error, sessions, complete, profile.displayUnit]);

  const start = (format: Format): void => {
    setDone(null);
    setFailed(null);
    written.current = null;
    setWanted(format);
  };

  return (
    <Card>
      <Heading>Export</Heading>
      <Body dimmed>
        A file of everything you have logged. The CSV is one row per set, converted to{' '}
        {profile.displayUnit} so a column can be summed. The JSON is a faithful copy, with each
        weight in the unit it was entered in.
      </Body>

      {done === null ? null : (
        <Notice
          tone="success"
          onClose={() => {
            setDone(null);
          }}
        >
          {done}
        </Notice>
      )}
      {error === null && failed === null ? null : (
        <Notice tone="danger" title="Nothing was exported">
          {error ?? failed ?? ''}
        </Notice>
      )}

      <View style={styles.row}>
        <Button
          size="compact"
          variant="subtle"
          label="Export CSV"
          busy={wanted === 'csv'}
          disabled={wanted !== null}
          onPress={() => {
            start('csv');
          }}
        />
        <Button
          size="compact"
          variant="subtle"
          label="Export JSON"
          busy={wanted === 'json'}
          disabled={wanted !== null}
          onPress={() => {
            start('json');
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
});
