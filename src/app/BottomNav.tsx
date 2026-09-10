import { NavLink } from 'react-router';
import classes from './AppLayout.module.css';

const ITEMS = [
  { to: '/', label: 'Today', glyph: '●' },
  { to: '/workouts', label: 'Workouts', glyph: '▤' },
  // The only way in. Nothing else in the app links here, so without this the
  // exercise library — and the button that creates a custom exercise — is
  // reachable only by typing the URL.
  { to: '/exercises', label: 'Exercises', glyph: '◇' },
  { to: '/history', label: 'History', glyph: '◷' },
  { to: '/settings', label: 'Settings', glyph: '⚙' },
] as const;

export function BottomNav() {
  return (
    <nav className={classes.nav} aria-label="Main">
      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className={classes.navItem}>
          <span className={classes.glyph} aria-hidden="true">
            {item.glyph}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
