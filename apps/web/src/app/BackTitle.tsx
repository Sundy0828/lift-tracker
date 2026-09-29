import { ActionIcon, Group, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

/**
 * A screen title with a back arrow beside it.
 *
 * The arrow is **inline with the title**, not a separate row above it: a
 * labelled button on its own line costs a line of a phone screen to say what
 * an arrow already says, and the title tells you what you would be leaving.
 *
 * **It goes back where you came from, and `to` is only the fallback.** Several
 * of these screens are reachable from more than one place — the workout
 * library from Workouts and from Settings, a lift's history from Records and
 * from a session — so a fixed destination is wrong for whoever took the other
 * route. React Router gives the first entry of a session the key `default`, so
 * a deep link or a reload has nothing behind it and follows `to` instead.
 *
 * The workout editor keeps its own copy of this row. Its title is an editable
 * field rather than a heading, which is a different control with different
 * focus and blur behaviour, and threading that through here would make this
 * component about the exception.
 */

/** Just the arrow, for a header that draws its own title. */
export function BackArrow({ to }: { to: string }) {
  const location = useLocation();
  const navigate = useNavigate();

  // The first entry of the session: arrived by link, bookmark or reload, so
  // there is nothing behind this screen to return to.
  const isEntryPoint = location.key === 'default';
  const arrow = <span aria-hidden="true">←</span>;

  if (isEntryPoint) {
    return (
      <ActionIcon
        component={Link}
        to={to}
        variant="subtle"
        size="lg"
        fz="lg"
        aria-label="Back"
        style={{ flexShrink: 0 }}
      >
        {arrow}
      </ActionIcon>
    );
  }

  return (
    <ActionIcon
      variant="subtle"
      size="lg"
      fz="lg"
      aria-label="Back"
      style={{ flexShrink: 0 }}
      onClick={() => {
        void navigate(-1);
      }}
    >
      {arrow}
    </ActionIcon>
  );
}

/** The arrow and the screen's title, on one row. */
export function BackTitle({
  to,
  title,
  children,
}: {
  /** Where the arrow goes when there is no history to go back to. */
  to: string;
  title: string;
  /** Anything sitting on the title row, such as a badge. */
  children?: ReactNode;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <BackArrow to={to} />
      <Title order={2} style={{ minWidth: 0, flex: 1 }} lineClamp={1}>
        {title}
      </Title>
      {children}
    </Group>
  );
}
