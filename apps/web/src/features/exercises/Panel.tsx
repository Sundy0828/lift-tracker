import { CloseButton, Group, Modal, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { BackArrow } from '@/app/BackTitle';
import classes from './Panel.module.css';

type PanelProps = {
  opened: boolean;
  onClose: () => void;
  /** Accessible name. The header inside draws the visible one. */
  label: string;
  /** Gives the body the whole height, for a list that scrolls inside it. */
  fill?: boolean | undefined;
  /** Set when this opens over another panel. */
  zIndex?: number | undefined;
  children: ReactNode;
};

/**
 * Above the bottom navigation (200) and the rest-timer bar (210).
 *
 * Mantine's own default is 200, which put the pinned rest bar on top of the
 * instructions you had just opened. A panel is the thing you asked for, so it
 * wins against the app chrome; a panel opened over another passes 400.
 */
export const PANEL_Z_INDEX = 300;

/**
 * For a dropdown opened from inside a panel.
 *
 * A combobox renders in its own portal at Mantine's default 300, which now
 * ties with the panel above it — and a tie is decided by whichever portal was
 * appended last. Stating the layer removes the coin toss.
 */
export const PANEL_DROPDOWN_Z_INDEX = PANEL_Z_INDEX + 1;

/** Overlay panel: the whole screen on a phone, the app column on a desktop. */
export function Panel({
  opened,
  onClose,
  label,
  fill = false,
  zIndex = PANEL_Z_INDEX,
  children,
}: PanelProps) {
  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      centered
      yOffset={0}
      xOffset={0}
      classNames={{
        content: classes.panel,
        body: fill ? `${classes.body} ${classes.bodyFill}` : classes.body,
      }}
      zIndex={zIndex}
    >
      <Modal.Overlay />
      <Modal.Content aria-label={label}>
        <Modal.Body>{children}</Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

type PanelHeaderProps = {
  title: string;
  /** Controls beside the title. */
  children?: ReactNode;
  /** Adds a close button after the controls. */
  onClose?: (() => void) | undefined;
  /**
   * Adds a back arrow before the title, with this as its fallback.
   *
   * For the screen version of a surface that is also shown as a panel: the
   * panel closes, but the screen has to go somewhere.
   */
  backTo?: string | undefined;
};

/** Title row, used in a panel and on the screen that shows the same content. */
export function PanelHeader({ title, children, onClose, backTo }: PanelHeaderProps) {
  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="xs" className={classes.header}>
      {backTo === undefined ? null : <BackArrow to={backTo} />}
      <Title order={2} size="h4" className={classes.title}>
        {title}
      </Title>
      <Group gap="xs" wrap="nowrap" className={classes.controls}>
        {children}
        {onClose === undefined ? null : (
          <CloseButton size="lg" aria-label="Close" onClick={onClose} />
        )}
      </Group>
    </Group>
  );
}
