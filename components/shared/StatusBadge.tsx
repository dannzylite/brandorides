import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, StatusColors, Typography } from '@/constants/theme';

type StatusVariant = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant?: StatusVariant;
}

export function StatusBadge({ label, variant = 'neutral' }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: StatusColors[variant] }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    alignSelf: 'flex-start',
  },
  label: {
    ...Typography.micro,
    fontWeight: '700',
    color: Colors.white,
  },
});
