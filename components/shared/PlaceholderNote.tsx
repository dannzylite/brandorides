import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface PlaceholderNoteProps {
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function PlaceholderNote({ text, icon = 'construct-outline' }: PlaceholderNoteProps) {
  return (
    <Card>
      <View style={styles.content}>
        <Ionicons name={icon} size={22} color={Colors.subtext} style={styles.icon} />
        <Text style={styles.text}>{text}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  icon: {
    marginBottom: Spacing.sm,
  },
  text: {
    ...Typography.body,
    color: Colors.subtext,
    textAlign: 'center',
  },
});
