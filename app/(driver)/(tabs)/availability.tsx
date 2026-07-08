import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { eachDayOfInterval, endOfMonth, format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { AVAILABILITY_LOCK_WINDOW_DAYS } from '@/constants';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import {
  addBlackoutDate,
  getDriverAvailability,
  getUpcomingTrips,
  removeBlackoutDate,
  setDayAvailability,
} from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { DriverAvailability, Ride, TimePreference } from '@/types';
import { parseDateOnly, projectMonthlyEarnings, safeFormat } from '@/utils';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_PREFERENCES: { key: TimePreference; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'flexible', label: 'Flexible' },
];

export default function AvailabilityScreen() {
  const [availabilityRows, setAvailabilityRows] = useState<DriverAvailability[]>([]);
  const [upcomingTrips, setUpcomingTrips] = useState<Ride[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [blackoutDate, setBlackoutDate] = useState(new Date());
  const [blackoutError, setBlackoutError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const driverId = useAuthStore.getState().user?.id;
    if (!driverId) return;
    const [availability, trips] = await Promise.all([getDriverAvailability(driverId), getUpcomingTrips(driverId)]);
    setAvailabilityRows(availability);
    setUpcomingTrips(trips);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const weekdayMap = useMemo(() => {
    const map = new Map<number, DriverAvailability>();
    for (const row of availabilityRows) {
      if (!row.is_blackout && row.day_of_week !== null) {
        map.set(row.day_of_week, row);
      }
    }
    return map;
  }, [availabilityRows]);

  const blackoutRows = useMemo(
    () =>
      availabilityRows
        .filter((row) => row.is_blackout && row.blackout_date)
        .sort((a, b) => (a.blackout_date! < b.blackout_date! ? -1 : 1)),
    [availabilityRows]
  );

  const lockedDays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + AVAILABILITY_LOCK_WINDOW_DAYS);
    const days = new Set<number>();
    for (const trip of upcomingTrips) {
      const tripDate = parseDateOnly(trip.departure_date);
      if (tripDate <= cutoff) {
        days.add(tripDate.getDay());
      }
    }
    return days;
  }, [upcomingTrips]);

  const upcomingBlackoutByWeekday = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    const map = new Map<number, string>();
    for (const row of blackoutRows) {
      const date = parseDateOnly(row.blackout_date!);
      if (date <= cutoff && date >= new Date(new Date().toDateString())) {
        map.set(date.getDay(), row.blackout_date!);
      }
    }
    return map;
  }, [blackoutRows]);

  const availableDaysThisMonth = useMemo(() => {
    const today = new Date();
    const days = eachDayOfInterval({ start: today, end: endOfMonth(today) });
    const blackoutDates = new Set(blackoutRows.map((row) => row.blackout_date));
    return days.filter((day) => weekdayMap.has(day.getDay()) && !blackoutDates.has(format(day, 'yyyy-MM-dd'))).length;
  }, [weekdayMap, blackoutRows]);

  const earningsRange = projectMonthlyEarnings(availableDaysThisMonth);

  const handleToggleDay = async (day: number, value: boolean) => {
    const driverId = useAuthStore.getState().user?.id;
    if (!driverId) return;

    if (!value && lockedDays.has(day)) {
      const lockedTrip = upcomingTrips.find((trip) => parseDateOnly(trip.departure_date).getDay() === day);
      Alert.alert(
        "Can't turn off this day",
        `You have a confirmed trip on ${safeFormat(lockedTrip?.departure_date, 'EEEE, MMM d')}.`
      );
      return;
    }

    const existing = weekdayMap.get(day);
    setSaving(true);
    try {
      await setDayAvailability(driverId, day, value, existing?.time_preference ?? 'flexible');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleSetPreference = async (day: number, preference: TimePreference) => {
    const driverId = useAuthStore.getState().user?.id;
    if (!driverId) return;
    setSaving(true);
    try {
      await setDayAvailability(driverId, day, true, preference);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleAddBlackout = async () => {
    const driverId = useAuthStore.getState().user?.id;
    if (!driverId) return;

    const dateString = format(blackoutDate, 'yyyy-MM-dd');
    if (blackoutRows.some((row) => row.blackout_date === dateString)) {
      setBlackoutError('That date is already blacked out.');
      return;
    }

    setBlackoutError(null);
    setSaving(true);
    try {
      await addBlackoutDate(driverId, dateString);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBlackout = async (id: string) => {
    const driverId = useAuthStore.getState().user?.id;
    if (!driverId) return;
    setSaving(true);
    try {
      await removeBlackoutDate(driverId, id);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer
      title="Availability"
      subtitle="Set when you're free to drive Winnipeg to Brandon."
      edges={['top', 'left', 'right']}
    >
      <View>
        <Text style={styles.sectionLabel}>Weekly Schedule</Text>
        {WEEKDAY_LABELS.map((label, day) => {
          const row = weekdayMap.get(day);
          const isAvailable = !!row;
          const isLocked = lockedDays.has(day);
          const upcomingBlackout = upcomingBlackoutByWeekday.get(day);

          return (
            <Card key={day} style={upcomingBlackout ? styles.dimmedCard : undefined}>
              <View style={styles.dayHeaderRow}>
                <View style={styles.dayLabelRow}>
                  <Text style={styles.dayLabel}>{label}</Text>
                  {isLocked ? <Ionicons name="lock-closed" size={14} color={Colors.subtext} style={styles.lockIcon} /> : null}
                </View>
                <Switch
                  value={isAvailable}
                  onValueChange={(value) => handleToggleDay(day, value)}
                  disabled={saving}
                  trackColor={{ true: Colors.primaryLight }}
                />
              </View>
              {isAvailable ? (
                <View style={styles.preferenceRow}>
                  {TIME_PREFERENCES.map(({ key, label: prefLabel }) => (
                    <Button
                      key={key}
                      label={prefLabel}
                      variant={row?.time_preference === key ? 'primary' : 'secondary'}
                      onPress={() => handleSetPreference(day, key)}
                      style={styles.preferenceButton}
                    />
                  ))}
                </View>
              ) : null}
              {upcomingBlackout ? (
                <Text style={styles.blackoutCaption}>Blacked out: {safeFormat(upcomingBlackout, 'MMM d')}</Text>
              ) : null}
            </Card>
          );
        })}
      </View>

      <View>
        <Text style={styles.sectionLabel}>Blackout Dates</Text>
        <Card>
          <Pressable style={styles.dateField} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateLabel}>Date</Text>
            <Text style={styles.dateValue}>{format(blackoutDate, 'MMM d, yyyy')}</Text>
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker
              value={blackoutDate}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(_event, selected) => {
                setShowDatePicker(false);
                if (selected) setBlackoutDate(selected);
              }}
            />
          ) : null}
          {blackoutError ? <Text style={styles.error}>{blackoutError}</Text> : null}
          <Button label="Add Blackout Date" variant="secondary" onPress={handleAddBlackout} loading={saving} style={styles.addBlackoutButton} />
        </Card>

        {blackoutRows.map((row) => (
          <Card key={row.id} style={styles.blackoutRow}>
            <Text style={styles.blackoutDate}>{safeFormat(row.blackout_date, 'EEEE, MMM d, yyyy')}</Text>
            <Pressable onPress={() => handleRemoveBlackout(row.id)} disabled={saving}>
              <Ionicons name="trash-outline" size={20} color={Colors.danger} />
            </Pressable>
          </Card>
        ))}
      </View>

      <View>
        <Text style={styles.sectionLabel}>Earnings Projection</Text>
        <Card>
          <Text style={styles.earningsRange}>
            Estimated ${(earningsRange.low / 100).toFixed(0)} - ${(earningsRange.high / 100).toFixed(0)} this month
          </Text>
          <Text style={styles.earningsCaption}>Based on {availableDaysThisMonth} available days</Text>
          <Text style={styles.earningsDisclaimer}>Rough estimate — actual trips depend on demand.</Text>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...Typography.caption,
    color: Colors.subtext,
    marginBottom: Spacing.sm,
  },
  dimmedCard: {
    opacity: 0.6,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayLabel: {
    ...Typography.h3,
    color: Colors.text,
  },
  lockIcon: {
    marginLeft: Spacing.xs,
  },
  preferenceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  preferenceButton: {
    flex: 1,
  },
  blackoutCaption: {
    ...Typography.micro,
    color: Colors.subtext,
    marginTop: Spacing.sm,
  },
  dateField: {
    backgroundColor: Colors.inputBackground,
    borderRadius: Radii.input,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.base,
  },
  dateLabel: {
    ...Typography.caption,
    color: Colors.subtext,
    marginBottom: Spacing.xs,
  },
  dateValue: {
    ...Typography.body,
    color: Colors.text,
  },
  error: {
    ...Typography.caption,
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  addBlackoutButton: {
    marginTop: Spacing.xs,
  },
  blackoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blackoutDate: {
    ...Typography.body,
    color: Colors.text,
  },
  earningsRange: {
    ...Typography.h2,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  earningsCaption: {
    ...Typography.caption,
    color: Colors.subtext,
  },
  earningsDisclaimer: {
    ...Typography.micro,
    color: Colors.subtext,
    marginTop: Spacing.xs,
  },
});
