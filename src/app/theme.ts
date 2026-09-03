import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Amber: reads well against the near-black gym-lighting dark scheme and still
// passes contrast on white.
const amber: MantineColorsTuple = [
  '#fff8e1',
  '#ffeeba',
  '#ffdb8a',
  '#ffc757',
  '#ffb62e',
  '#ffac14',
  '#ffa604',
  '#e39100',
  '#ca8000',
  '#af6d00',
];

export const theme = createTheme({
  primaryColor: 'amber',
  primaryShade: { light: 7, dark: 4 },
  colors: { amber },
  defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: { fontWeight: '650' },
  // Touch targets first: the set grid is used with one thumb, mid-set.
  components: {
    Button: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
  },
});
