import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Group } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './SortableList.module.css';

/**
 * Vertical drag reordering that works with a thumb.
 *
 * HTML5 drag-and-drop does not fire on touch at all, so this uses dnd-kit's
 * pointer sensor (~11 kB gzipped for core + sortable + modifiers). Its
 * keyboard sensor also makes reordering reachable without a pointer, and the
 * explicit up/down buttons below give a third route on small screens where
 * dragging inside a scrolling list is fiddly.
 */

type SortableRowProps = {
  id: string;
  /** Position and count, for the move buttons and screen-reader text. */
  index: number;
  total: number;
  label: string;
  onMove: (from: number, to: number) => void;
  children: ReactNode;
};

export function SortableRow({ id, index, total, label, onMove, children }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={classes.row}
      data-dragging={isDragging ? 'true' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className={classes.body}>{children}</div>

      <Group gap={2} wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          disabled={index === 0}
          aria-label={`Move ${label} up`}
          onClick={() => {
            onMove(index, index - 1);
          }}
        >
          ↑
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          disabled={index === total - 1}
          aria-label={`Move ${label} down`}
          onClick={() => {
            onMove(index, index + 1);
          }}
        >
          ↓
        </ActionIcon>
        <ActionIcon
          ref={setActivatorNodeRef}
          variant="subtle"
          color="gray"
          size="lg"
          className={classes.handle}
          aria-label={`Reorder ${label}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </ActionIcon>
      </Group>
    </div>
  );
}

type SortableListProps = {
  /** Stable ids, in current display order. */
  ids: readonly string[];
  onReorder: (from: number, to: number) => void;
  children: ReactNode;
};

export function SortableList({ ids, onReorder, children }: SortableListProps) {
  const sensors = useSensors(
    // A small distance threshold so a tap on a row still registers as a tap.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;

    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
        <div className={classes.list}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}
