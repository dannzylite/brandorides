import { useCallback, useState } from 'react';
import { Switch, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { FlightStatus } from '@/components/shared/FlightStatus';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LeaveTimeDisplay } from '@/components/driver/LeaveTimeDisplay';
import { Colors, Spacing, Typography } from '@/constants/theme';
import {
  addBlackoutDate,
  getDriverAvailability,
  getPendingOffers,
  getUpcomingTrips,
  getWeeklyEarnings,
  removeBlackoutDate,
  setDayAvailability,
  supabase,
} from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { DriverAvailability, Ride, RidePassenger, TripOffer } from '@/types';
import { safeFormat } from '@/utils';

export default function DriverHomeScreen() {
  const { profile, driverProfile } = useAuthStore();
  const [pendingOffers, setPendingOffers] = useState<TripOffer[]>([]);
  const [upcomingTrip, setUpcomingTrip] = useState<Ride | null>(null);
  const [upcomingTripEarnings, setUpcomingTripEarnings] = useState(0);
  const [weeklyEarnings, setWeeklyEarnings] = useState(0);
  const [availabilityRows, setAvailabilityRows] = useState<DriverAvailability[]>([]);
  const [togglingToday, setTogglingToday] = useState(false);

  const load = useCallback(async () => {
    const driverId = useAuthStore.getState().user?.id;
    if (!driverId) return;

    const [offers, trips, earnings, availability] = await Promise.all([
      getPendingOffers(driverId),
      getUpcomingTrips(driverId),
      getWeeklyEarnings(driverId),
      getDriverAvailability(driverId),
    ]);

    setPendingOffers(offers);
    setWeeklyEarnings(earnings);
    setAvailabilityRows(availability);

    const nextTrip = trips[0] ?? null;
    setUpcomingTrip(nextTrip);

    if (nextTrip) {
      const { data: passengers } = await supabase
        .from('ride_passengers')
        .select('seat_fare, wait_fee_charged')
        .eq('ride_id', nextTrip.id);
      const total = ((passengers ?? []) as Pick<RidePassenger, 'seat_fare' | 'wait_fee_charged'>[]).reduce(
        (sum, p) => sum + p.seat_fare + p.wait_fee_charged,
        0
      );
      setUpcomingTripEarnings(Math.round(total * 0.8));
    } else {
      setUpcomingTripEarnings(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const todayDow = today.getDay();
  const todayBlackout = availabilityRows.find((row) => row.is_blackout && row.blackout_date === todayIso);
  const todayWeekdayRow = availabilityRows.find((row) => !row.is_blackout && row.day_of_week === todayDow);
  const isAvailableToday = !!todayWeekdayRow && !todayBlackout;

  const handleToggleToday = async (value: boolean) => {
    const driverId = useAuthStore.getState().user?.id;
    if (!driverId) return;

    setTogglingToday(true);
    try {
      if (!value) {
        await addBlackoutDate(driverId, todayIso);
      } else {
        if (todayBlackout) {
          await removeBlackoutDate(driverId, todayBlackout.id);
        }
        if (!todayWeekdayRow) {
          await setDayAvailability(driverId, todayDow, true, 'flexible');
        }
      }
      await load();
    } finally {
      setTogglingToday(false);
    }
  };

  const soonestOffer = pendingOffers[0];

  return (
    <ScreenContainer title="Home" edges={['top', 'left', 'right']}>
      <Card>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile?.full_name ?? 'Driver'}</Text>
          <StatusBadge label={driverProfile?.is_approved ? 'Approved Driver' : 'Pending Approval'} variant={driverProfile?.is_approved ? 'success' : 'warning'} />
        </View>
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Ionicons
              key={star}
              name={Math.round(driverProfile?.rating ?? 5) >= star ? 'star' : 'star-outline'}
              size={16}
              color={Colors.accent}
              style={styles.star}
            />
          ))}
          <Text style={styles.ratingText}>
            {(driverProfile?.rating ?? 5).toFixed(1)} · {driverProfile?.total_trips ?? 0} trips
          </Text>
        </View>
      </Card>

      {soonestOffer ? (
        <Card style={styles.offerCard} onPress={() => router.push({ pathname: '/(driver)/trip-offer', params: { offerId: soonestOffer.id } })}>
          <Text style={styles.offerTitle}>New Trip Offer</Text>
          <Text style={styles.offerBody}>A student needs a ride — tap to see the details.</Text>
          <View style={styles.viewDetailsRow}>
            <Text style={styles.viewDetailsText}>View Offer</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.white} />
          </View>
        </Card>
      ) : null}

      {upcomingTrip ? (
        <View>
          <Text style={styles.sectionLabel}>Upcoming Trip</Text>
          <Card>
            <Text style={styles.tripDate}>{safeFormat(upcomingTrip.departure_date, 'EEEE, MMM d')}</Text>
            <SummaryRow label="Students" value={String(upcomingTrip.filled_seats)} />
            <SummaryRow label="Earnings" value={`$${(upcomingTripEarnings / 100).toFixed(2)}`} />
          </Card>
          <FlightStatus ride={upcomingTrip} />
          <LeaveTimeDisplay ride={upcomingTrip} />
        </View>
      ) : null}

      <View>
        <Text style={styles.sectionLabel}>This Week's Earnings</Text>
        <Card>
          <Text style={styles.earningsValue}>${(weeklyEarnings / 100).toFixed(2)}</Text>
          <Text style={styles.earningsCaption}>From completed trips this week</Text>
        </Card>
      </View>

      <Card>
        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleLabel}>Available for trips today</Text>
          </View>
          <Switch value={isAvailableToday} onValueChange={handleToggleToday} disabled={togglingToday} trackColor={{ true: Colors.primaryLight }} />
        </View>
      </Card>

      <Button label="Manage Full Schedule" variant="secondary" onPress={() => router.push('/(driver)/(tabs)/availability')} />
    </ScreenContainer>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  name: {
    ...Typography.h2,
    color: Colors.text,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: 2,
  },
  ratingText: {
    ...Typography.caption,
    color: Colors.subtext,
    marginLeft: Spacing.xs,
  },
  offerCard: {
    backgroundColor: Colors.primary,
  },
  offerTitle: {
    ...Typography.h3,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  offerBody: {
    ...Typography.body,
    color: Colors.white,
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  viewDetailsText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: '600',
    marginRight: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.subtext,
    marginBottom: Spacing.sm,
  },
  tripDate: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  rowLabel: {
    ...Typography.body,
    color: Colors.subtext,
  },
  rowValue: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  earningsValue: {
    ...Typography.hero,
    color: Colors.primary,
  },
  earningsCaption: {
    ...Typography.caption,
    color: Colors.subtext,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleLabel: {
    ...Typography.body,
    color: Colors.text,
  },
});
