import { memo, useState } from 'react';
import type { Exercise } from '@/domain/exercises';
import { catalogImageUrls } from '@/domain/exercises';
import classes from './ExerciseThumb.module.css';

type Props = {
  exercise: Exercise;
  size?: number;
};

/**
 * The first frame of an exercise, as a small thumbnail.
 *
 * Images are remote (free-exercise-db on raw.githubusercontent.com) and three
 * exercises have none, so a failed load falls back to a neutral glyph rather
 * than a broken-image icon. `loading="lazy"` matters here: the list is
 * virtualised, so only rows near the viewport ever fetch.
 */
export const ExerciseThumb = memo(function ExerciseThumb({ exercise, size = 48 }: Props) {
  const [failed, setFailed] = useState(false);
  const url = catalogImageUrls(exercise)[0];

  if (url === undefined || failed) {
    return (
      <div className={classes.placeholder} style={{ width: size, height: size }} aria-hidden="true">
        {exercise.isCustom ? '★' : '◍'}
      </div>
    );
  }

  return (
    <img
      className={classes.thumb}
      style={{ width: size, height: size }}
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => {
        setFailed(true);
      }}
    />
  );
});
