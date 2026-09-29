import {
  Card,
  ColorSwatch,
  Group,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from '@mantine/core';
import { THEME_PRESETS } from '@/app/theme';
import { useThemePreset } from '@/app/themePreset';

/** Light or dark. `auto` follows the device. */
function asColorScheme(value: string): 'auto' | 'light' | 'dark' {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

/**
 * Colour scheme and accent preset.
 *
 * Both are kept on the device rather than in the profile: they have to be
 * right on the first paint, and the profile arrives over Firestore, which is
 * not on the first-paint path (§3). The trade is that a second device starts
 * on the defaults.
 */
export function AppearanceCard() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [preset, setPreset] = useThemePreset();

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text fw={600}>Appearance</Text>

        <SegmentedControl
          fullWidth
          value={colorScheme}
          onChange={(value) => {
            setColorScheme(asColorScheme(value));
          }}
          data={[
            { value: 'auto', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          aria-label="Color scheme"
        />

        <Text size="sm" c="dimmed">
          The accent colours the rest timer, the delta chips and the muscle map. Kept on this
          device, so another phone starts on the default.
        </Text>

        <Group gap="sm">
          {THEME_PRESETS.map((option) => (
            <UnstyledButton
              key={option.id}
              aria-label={option.label}
              aria-pressed={option.id === preset}
              onClick={() => {
                setPreset(option.id);
              }}
            >
              <Stack gap={4} align="center">
                <ColorSwatch
                  // Shade 6, which sits between the light and dark primaries,
                  // so one swatch reads correctly in either scheme.
                  color={option.colors[6]}
                  size={36}
                  withShadow={false}
                  style={{
                    outline:
                      option.id === preset ? '2px solid var(--mantine-color-text)' : undefined,
                    outlineOffset: 2,
                    cursor: 'pointer',
                  }}
                />
                <Text size="xs" c={option.id === preset ? 'var(--mantine-color-text)' : 'dimmed'}>
                  {option.label}
                </Text>
              </Stack>
            </UnstyledButton>
          ))}
        </Group>
      </Stack>
    </Card>
  );
}
