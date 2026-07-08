import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, MinSizes, Spacing, Typography } from '@/constants/theme';

interface ProfileMenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
}

export function ProfileMenuRow({
  icon,
  label,
  onPress,
  destructive = false,
  showChevron = true,
}: ProfileMenuRowProps) {
  const color = destructive ? Colors.danger : Colors.text;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.left}>
        <Ionicons name={icon} size={20} color={color} style={styles.icon} />
        <Text style={[styles.label, { color }]}>{label}</Text>
      </View>
      {showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={Colors.subtext} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinSizes.listItemHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
  },
  pressed: {
    opacity: 0.6,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: Spacing.md,
  },
  label: {
    ...Typography.body,
  },
});
