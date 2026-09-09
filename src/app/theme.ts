import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Baby blue: stays pastel at the shades the theme actually uses, and reads
// clearly against the near-black gym-lighting dark scheme.
const sky: MantineColorsTuple = [
  '#eef8fd',
  '#dcf0fa',
  '#b8e2f6',
  '#92d3f1',
  '#74c7ee',
  '#62c0ec',
  '#56bced',
  '#47a5d2',
  '#3892bc',
  '#237ea6',
];

export const theme = createTheme({
  primaryColor: 'sky',
  primaryShade: { light: 7, dark: 4 },
  colors: { sky },
  // A pastel primary needs dark label text on filled controls to stay readable.
  autoContrast: true,
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
