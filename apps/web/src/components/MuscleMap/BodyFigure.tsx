import { memo } from 'react';
import type { BodyRegion, BodyView } from './bodyPolygons';
import { VIEW_BOX, inertFor, regionsFor } from './bodyPolygons';
import classes from './BodyFigure.module.css';

type Props = {
  view: BodyView;
  /** Extra classes for one muscle region, which carry its fill. */
  classFor: (region: BodyRegion) => string;
};

/** The front and back outlines side by side. */
export function BodyPair({ classFor }: { classFor: (region: BodyRegion) => string }) {
  return (
    <div className={classes.pair}>
      <BodyFigure view="front" classFor={classFor} />
      <BodyFigure view="back" classFor={classFor} />
    </div>
  );
}

/**
 * One body outline with its muscle regions, front or back.
 *
 * The drawing is decorative and hidden from assistive technology. Every map
 * built on it states the same thing in text.
 */
const BodyFigure = memo(function BodyFigure({ view, classFor }: Props) {
  return (
    <figure className={classes.figure}>
      <svg className={classes.svg} viewBox={VIEW_BOX} aria-hidden="true" focusable="false">
        {inertFor(view).map((points) => (
          <polygon key={points} className={classes.inert} points={points} />
        ))}
        {regionsFor(view).map((region) => (
          <g
            key={region.id}
            data-muscle={region.id}
            className={`${classes.shape} ${classFor(region)}`}
          >
            {region.polygons.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </g>
        ))}
      </svg>
      <figcaption className={classes.caption}>{view}</figcaption>
    </figure>
  );
});
