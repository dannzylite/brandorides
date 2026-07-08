import { useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/shared/Card';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { getDriverProfile } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const POLL_INTERVAL_MS = 30000;

export default function PendingApprovalScreen() {
  const driverProfile = useAuthStore((state) => state.driverProfile);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const user = useAuthStore.getState().user;
      if (!user) return;

      const updated = await getDriverProfile(user.id);
      if (updated?.is_approved) {
        await useAuthStore.getState().refreshProfile();
        router.replace('/(driver)/(tabs)/home');
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <ScreenContainer title="Application Under Review" edges={['top', 'left', 'right', 'bottom']}>
      <Card>
        <Text style={styles.body}>
          Thanks for signing up to drive with BrandoRides. We're reviewing your license and
          insurance now — this usually takes less than a day. We'll let you know as soon as
          you're approved to start picking up students.
        </Text>
      </Card>

      <View>
        <Text style={styles.sectionLabel}>Documents Submitted</Text>
        <Card>
          <View style={styles.docRow}>
            <Ionicons
              name={driverProfile?.license_url ? 'checkmark-circle' : 'time-outline'}
              size={20}
              color={driverProfile?.license_url ? Colors.primaryLight : Colors.subtext}
            />
            <Text style={styles.docLabel}>Driver's License</Text>
          </View>
          <View style={styles.docRow}>
            <Ionicons
              name={driverProfile?.insurance_url ? 'checkmark-circle' : 'time-outline'}
              size={20}
              color={driverProfile?.insurance_url ? Colors.primaryLight : Colors.subtext}
            />
            <Text style={styles.docLabel}>Vehicle Insurance</Text>
          </View>
        </Card>
      </View>

      <Card>
        <Text style={styles.body}>
          Questions about your application? Email us at support@brandorides.com and we'll help you
          out.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    ...Typography.body,
    color: Colors.text,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.subtext,
    marginBottom: Spacing.sm,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  docLabel: {
    ...Typography.body,
    color: Colors.text,
  },
});
