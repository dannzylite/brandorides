import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useRideStore } from '@/store/rideStore';
import type { DriverProfile, Ride, RidePassenger } from '@/types';
import { rideStatusLabel, rideStatusVariant, safeFormat } from '@/utils';

interface PastTrip {
  ride: Ride;
  passenger: RidePassenger;
}

export default function StudentHomeScreen() {
  const profile = useAuthStore((state) => state.profile);
  const { currentRide, fetchMyActiveRide } = useRideStore();
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [pastTrips, setPastTrips] = useState<PastTrip[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchMyActiveRide();
    }, [fetchMyActiveRide])
  );

  useEffect(() => {
    if (!currentRide?.driver_id) {
      setDriver(null);
      return;
    }
    supabase
      .from('driver_profiles')
      .select('*')
      .eq('id', currentRide.driver_id)
      .maybeSingle()
      .then(({ data }) => setDriver(data as DriverProfile | null));
  }, [currentRide?.driver_id]);

  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    supabase
      .from('ride_passengers')
      .select('*, rides!inner(*)')
      .eq('student_id', user.id)
      .eq('rides.status', 'completed')
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        const rows = (data ?? []) as (RidePassenger & { rides: Ride })[];
        setPastTrips(rows.map((row) => ({ ride: row.rides, passenger: row })));
      });
  }, []);

  return (
    <ScreenContainer title="Home" showArc edges={['top', 'left', 'right']}>
      {!profile?.is_verified ? (
        <Card>
          <View style={styles.pendingRow}>
            <StatusBadge label="Verification Pending" variant="warning" />
          </View>
          <Text style={styles.pendingBody}>
            We're reviewing your student documents. You can still book a ride in the meantime.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.heroCard}>
        <Text style={styles.heroTitle}>
          Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
        </Text>
        <Text style={styles.heroBody}>
          Long flight? We&apos;ll have a driver waiting when you land at Winnipeg — sit back, you&apos;re almost there.
        </Text>
      </Card>

      {currentRide ? (
        <View>
          <Text style={styles.sectionLabel}>Upcoming Ride</Text>
          <Card onPress={() => router.push('/(student)/ride-status')}>
            <View style={styles.rideHeaderRow}>
              <Text style={styles.rideFlight}>{currentRide.flight_number}</Text>
              <StatusBadge label={rideStatusLabel(currentRide.status)} variant={rideStatusVariant(currentRide.status)} />
            </View>
            <Text style={styles.rideDetail}>
              {safeFormat(currentRide.departure_date, 'MMM d, yyyy')} · Landing{' '}
              {safeFormat(currentRide.estimated_landing, 'h:mm a')}
            </Text>
            {driver ? (
              <Text style={styles.rideDetail}>
                Driver: {driver.vehicle_color} {driver.vehicle_make} {driver.vehicle_model} · {driver.vehicle_plate}
              </Text>
            ) : (
              <Text style={styles.rideDetail}>Driver not assigned yet</Text>
            )}
            <View style={styles.viewDetailsRow}>
              <Text style={styles.viewDetailsText}>View details</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </View>
          </Card>
        </View>
      ) : (
        <View>
          <Text style={styles.sectionLabel}>Book Your Airport Pickup</Text>
          <Card>
            <Text style={styles.stepText}>1. Tell us your flight number and arrival date</Text>
            <Text style={styles.stepText}>2. Add your luggage details and pick shared or solo</Text>
            <Text style={styles.stepText}>3. Confirm — we'll match you with a driver</Text>
          </Card>
          <Button label="Book Your Airport Pickup" onPress={() => router.push('/(student)/book')} />
        </View>
      )}

      {pastTrips.length > 0 ? (
        <View>
          <Text style={styles.sectionLabel}>Past Trips</Text>
          {pastTrips.map(({ ride }) => (
            <Card key={ride.id}>
              <Text style={styles.rideFlight}>{ride.flight_number}</Text>
              <Text style={styles.rideDetail}>{safeFormat(ride.departure_date, 'MMM d, yyyy')}</Text>
            </Card>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pendingRow: {
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  pendingBody: {
    ...Typography.body,
    color: Colors.subtext,
  },
  heroCard: {
    backgroundColor: Colors.primaryPale,
  },
  heroTitle: {
    ...Typography.h2,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  heroBody: {
    ...Typography.body,
    color: Colors.primary,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.subtext,
    marginBottom: Spacing.sm,
  },
  rideHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  rideFlight: {
    ...Typography.h3,
    color: Colors.text,
  },
  rideDetail: {
    ...Typography.caption,
    color: Colors.subtext,
    marginTop: Spacing.xs,
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  viewDetailsText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    marginRight: Spacing.xs,
  },
  stepText: {
    ...Typography.body,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
});
