import { Center, Text } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Exercise } from '@/domain/exercises';
import { ExerciseRow } from './ExerciseRow';
import classes from './ExerciseList.module.css';

const ROW_HEIGHT = 52;

type Props = {
  exercises: readonly Exercise[];
  onSelect: (exercise: Exercise) => void;
};

/**
 * Virtualised so that matching 876 exercises renders a screenful of rows
 * rather than 876 of them (§3).
 */
export function ExerciseList({ exercises, onSelect }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // React Compiler cannot auto-memoise a component holding a virtualiser,
  // because useVirtualizer returns fresh functions each render. That is fine
  // here: the expensive part is the rows, and ExerciseRow is memo()d by hand.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: exercises.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  return (
    <div className={classes.viewport} ref={viewportRef} data-testid="exercise-list">
      {exercises.length === 0 ? (
        <Center h="100%" p="md">
          <Text c="dimmed" size="sm" ta="center">
            No exercises match. Try a shorter search, clear a filter, or add a custom exercise.
          </Text>
        </Center>
      ) : (
        <div className={classes.spacer} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const exercise = exercises[item.index];
            if (exercise === undefined) return null;
            return (
              <div
                key={exercise.id}
                className={classes.item}
                style={{ height: item.size, transform: `translateY(${String(item.start)}px)` }}
              >
                <ExerciseRow exercise={exercise} onSelect={onSelect} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
