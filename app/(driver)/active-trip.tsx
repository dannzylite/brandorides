import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Colors, Spacing, Typography } from '@/constants/theme';

const DETAILS = [
  { label: 'Passenger', value: '—' },
  { label: 'Dropoff', value: 'Brandon, MB' },
  { label: 'Elapsed Time', value: '0:00' },
];

export default function ActiveTripScreen() {
  return (
    <ScreenContainer
      title="Active Trip"
      subtitle="You're on your way to Brandon. Drive safe — we'll notify the student of updates."
      showArc
      footer={<Button label="Complete Trip" onPress={() => router.replace('/(driver)/(tabs)/home')} />}
    >
      <Card>
        {DETAILS.map(({ label, value }) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </Card>
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
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
});
