import { ACCENT_PRESETS } from '@lift/ui-tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme, type SchemePreference } from '../../theme';
import { Body, Card, Heading, Segmented } from '../ui';

const SCHEMES: readonly { value: SchemePreference; label: string }[] = [
  { value: 'auto', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Colour scheme and accent preset: the web's `AppearanceCard`.
 *
 * Both are kept on this phone rather than in the profile, as the web keeps
 * them per browser: they have to be right on the first frame. A second
 * device starts on the defaults.
 */
export function AppearanceCard() {
  const palette = usePalette();
  const { preference, setPreference, accentId, setAccent } = useTheme();

  return (
    <Card>
      <Heading>Appearance</Heading>
      <Segmented
        label="Colour scheme"
        options={SCHEMES}
        value={preference}
        onChange={setPreference}
      />
      <Body dimmed>
        The accent colours the rest timer, the delta chips and the calendar. Kept on this phone, so
        another device starts on the default.
      </Body>
      <View style={styles.swatches}>
        {ACCENT_PRESETS.map((option) => {
          const selected = option.id === accentId;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => {
                setAccent(option.id);
              }}
              style={styles.option}
            >
              <View style={[styles.ring, { borderColor: selected ? palette.text : 'transparent' }]}>
                {/* Shade 6 sits between the light and dark primaries, so one
                    swatch reads right in either scheme. */}
                <View style={[styles.swatch, { backgroundColor: option.colors[6] }]} />
              </View>
              <Text
                style={[
                  styles.label,
                  { color: selected ? palette.text : palette.dimmed },
                  selected && styles.selected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  option: { alignItems: 'center', gap: 4 },
  ring: { borderWidth: 2, borderRadius: 24, padding: 2 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  label: { fontSize: 12 },
  selected: { fontWeight: '600' },
});
