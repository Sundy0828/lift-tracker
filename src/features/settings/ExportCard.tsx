import { Alert, Button, Card, Group, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useAllSessions } from '@/data/hooks/useAllSessions';
import { useProfile } from '@/data/hooks/useProfile';
import { exportFilename, sessionsToCsv, sessionsToJson } from '@/domain/export';

/**
 * Getting your training out of the app.
 *
 * Two formats, because they answer two questions (see `domain/export`): a CSV
 * of one row per set for a spreadsheet, and a JSON copy of the session
 * documents for anything that has to be read back.
 *
 * The history is read **on demand**, not subscribed: an export is a button
 * press, and holding every session ever logged in memory for the life of the
 * Settings screen would be a cost paid by everyone who never presses it.
 */
type Format = 'csv' | 'json';

function download(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on the next turn of the loop: revoking synchronously races Safari,
  // which has not started reading the blob when `click` returns.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function ExportCard() {
  const { profile } = useProfile();
  const [wanted, setWanted] = useState<Format | null>(null);
  const { sessions, isPending, complete, error } = useAllSessions(wanted !== null);
  const [done, setDone] = useState<string | null>(null);
  /** The request already written, so one press cannot save two files. */
  const written = useRef<Format | null>(null);

  // The read starts when a button is pressed and the file is written the
  // moment it lands, so the press is one action rather than press-then-wait.
  useEffect(() => {
    if (wanted === null || isPending || error !== null || written.current === wanted) return;

    written.current = wanted;
    if (wanted === 'csv') {
      download(exportFilename('csv'), sessionsToCsv(sessions, profile.displayUnit), 'text/csv');
    } else {
      download(exportFilename('json'), sessionsToJson(sessions), 'application/json');
    }
    setDone(
      complete
        ? `${String(sessions.length)} sessions exported.`
        : `${String(sessions.length)} most recent sessions exported — there are older ones this could not read in one go.`,
    );
    setWanted(null);
  }, [wanted, isPending, error, sessions, complete, profile.displayUnit]);

  const start = (format: Format): void => {
    setDone(null);
    written.current = null;
    setWanted(format);
  };

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text fw={600}>Export</Text>

        <Text size="sm" c="dimmed">
          A file of everything you have logged. The CSV is one row per set, converted to{' '}
          {profile.displayUnit} so a column can be summed. The JSON is a faithful copy, with each
          weight in the unit it was entered in.
        </Text>

        {done === null ? null : (
          <Alert
            variant="light"
            color="green"
            withCloseButton
            onClose={() => {
              setDone(null);
            }}
          >
            <Text size="sm">{done}</Text>
          </Alert>
        )}

        {error === null ? null : (
          <Alert variant="light" color="red" title="Nothing was exported">
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        <Group gap="xs">
          <Button
            variant="default"
            loading={wanted === 'csv'}
            disabled={wanted !== null}
            onClick={() => {
              start('csv');
            }}
          >
            Export CSV
          </Button>
          <Button
            variant="default"
            loading={wanted === 'json'}
            disabled={wanted !== null}
            onClick={() => {
              start('json');
            }}
          >
            Export JSON
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
