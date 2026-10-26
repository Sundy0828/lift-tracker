import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import classes from './AppLayout.module.css';

/** Draws one tab icon on a 24-unit grid, in the link's own colour. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

type Item = { to: string; label: string; icon: ReactNode };

const ITEMS: readonly Item[] = [
  {
    to: '/',
    label: 'Today',
    icon: (
      <Icon>
        <rect x="3.25" y="5" width="17.5" height="15.5" rx="2.5" />
        <path d="M8 3v4M16 3v4M3.25 10h17.5" />
        <circle cx="12" cy="15.25" r="1.5" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    to: '/workouts',
    label: 'Workouts',
    icon: (
      <Icon>
        <path d="M9 6.5h11.5M9 12h11.5M9 17.5h11.5" />
        <circle cx="4.5" cy="6.5" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="4.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="4.5" cy="17.5" r="1.25" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    to: '/history',
    label: 'History',
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5.25l3.5 2" />
      </Icon>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <Icon>
        <path d="M3.25 7.5h4M11.75 7.5h9" />
        <circle cx="9.5" cy="7.5" r="2.25" />
        <path d="M3.25 16.5h8.5M16.75 16.5h4" />
        <circle cx="14.5" cy="16.5" r="2.25" />
      </Icon>
    ),
  },
];

export function BottomNav() {
  return (
    <nav className={classes.nav} aria-label="Main">
      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className={classes.navItem}>
          <span className={classes.glyph} aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
