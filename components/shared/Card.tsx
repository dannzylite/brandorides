import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Radii, Shadows, Spacing, MinSizes } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, padded = true, style }: CardProps) {
  const content = [styles.card, padded && styles.padded, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...content, pressed && styles.pressed, styles.pressable]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={content}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.card,
    ...Shadows.card,
  },
  padded: {
    padding: Spacing.base,
  },
  pressable: {
    minHeight: MinSizes.touchTarget,
  },
  pressed: {
    opacity: 0.85,
  },
});
