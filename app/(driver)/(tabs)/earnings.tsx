import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/shared/Card';
import { PlaceholderNote } from '@/components/shared/PlaceholderNote';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function EarningsScreen() {
  return (
    <ScreenContainer
      title="Earnings"
      subtitle="Track what you've earned driving students to Brandon."
      edges={['top', 'left', 'right']}
    >
      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>This week</Text>
          <Text style={styles.value}>$0.00</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Completed trips</Text>
          <Text style={styles.value}>0</Text>
        </View>
      </Card>
      <PlaceholderNote text="Your trip-by-trip earnings history will appear here." icon="receipt-outline" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  label: {
    ...Typography.body,
    color: Colors.subtext,
  },
  value: {
    ...Typography.h3,
    color: Colors.text,
  },
});
