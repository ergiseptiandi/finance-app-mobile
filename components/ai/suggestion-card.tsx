import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColorTheme } from '@/constants/theme';

export type SuggestionItem = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  color: string;
};

type SuggestionCardProps = {
  label: string;
  items: SuggestionItem[];
  onSelect: (label: string) => void;
  colors: AppColorTheme;
};

export function SuggestionCard({ label, items, onSelect, colors }: SuggestionCardProps) {
  const styles = createStyles(colors);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.grid}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => onSelect(item.label)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, { backgroundColor: alpha(item.color, 0.1), borderColor: alpha(item.color, 0.2) }]}
            accessibilityRole="button"
            accessibilityLabel={item.label}>
            <MaterialCommunityIcons name={item.icon} size={16} color={item.color} />
            <Text style={[styles.chipText, { color: item.color }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: AppColorTheme) =>
  StyleSheet.create({
    card: {
      gap: 10,
    },
    label: {
      color: colors.shellTextMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
    },
    chipPressed: {
      opacity: 0.7,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
    },
  });
