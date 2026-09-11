import { CloseButton, Group, Modal, Title } from '@mantine/core';
import type { ReactNode } from 'react';
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

/** Overlay panel: the whole screen on a phone, the app column on a desktop. */
export function Panel({ opened, onClose, label, fill = false, zIndex, children }: PanelProps) {
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
      // Spread rather than passed: Modal's own default has to survive.
      {...(zIndex === undefined ? {} : { zIndex })}
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
};

/** Title row, used in a panel and on the screen that shows the same content. */
export function PanelHeader({ title, children, onClose }: PanelHeaderProps) {
  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="xs" className={classes.header}>
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
