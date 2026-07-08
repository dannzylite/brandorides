import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/shared/Card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Ride } from '@/types';
import { safeFormat } from '@/utils';

interface FlightStatusProps {
  ride: Ride;
}

type BadgeVariant = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

// 'departed' only ever gets set once a check confirms delay < 10 min, so
// "ON TIME" is a more informative label than the generic "DEPARTED" for
// the exact same underlying state — there's no separate stored status
// for it (see flight_status CHECK constraint in migration 016).
const STATUS_LABELS: Record<Ride['flight_status'], string> = {
  scheduled: 'SCHEDULED',
  departed: 'ON TIME',
  delayed: 'DELAYED',
  landed: 'LANDED',
  cancelled: 'CANCELLED',
  unknown: 'CHECKING...',
};

const STATUS_VARIANTS: Record<Ride['flight_status'], BadgeVariant> = {
  scheduled: 'neutral',
  departed: 'success',
  delayed: 'warning',
  landed: 'success',
  cancelled: 'danger',
  unknown: 'neutral',
};

export function FlightStatus({ ride: initialRide }: FlightStatusProps) {
  const [ride, setRide] = useState(initialRide);
  const [originalLanding, setOriginalLanding] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setRide(initialRide);
  }, [initialRide]);

  // Real-time: any change to flight_status/estimated_landing on this ride
  // updates the card instantly, no screen refresh needed.
  useEffect(() => {
    const channel = supabase
      .channel(`flight-status-${initialRide.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${initialRide.id}` },
        (payload) => setRide(payload.new as Ride)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialRide.id]);

  // The pre-delay landing estimate isn't kept on `rides` (it's overwritten
  // when a delay is applied) — the first-ever logged check ('validation',
  // from booking time) is the only place the original estimate survives.
  useEffect(() => {
    supabase
      .from('flight_checks')
      .select('estimated_landing_at_check')
      .eq('ride_id', initialRide.id)
      .eq('check_type', 'validation')
      .maybeSingle()
      .then(({ data }) => setOriginalLanding(data?.estimated_landing_at_check ?? null));
  }, [initialRide.id]);

  useEffect(() => {
    if (ride.flight_status !== 'landed') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ride.flight_status, pulse]);

  const isDelayed = ride.flight_status === 'delayed' && originalLanding && originalLanding !== ride.estimated_landing;

  return (
    <Card>
      <Text style={styles.flightNumber}>{ride.flight_number}</Text>
      <Text style={styles.route}>
        {ride.flight_origin_city ?? ride.flight_origin}
        {ride.flight_origin_code ? ` (${ride.flight_origin_code})` : ''} → Winnipeg (YWG)
      </Text>

      <View style={styles.badgeRow}>
        <Animated.View style={{ opacity: ride.flight_status === 'landed' ? pulse : 1 }}>
          <StatusBadge label={STATUS_LABELS[ride.flight_status]} variant={STATUS_VARIANTS[ride.flight_status]} />
        </Animated.View>
      </View>

      {isDelayed ? (
        <Text style={styles.landingRow}>
          Estimated landing: <Text style={styles.strikethrough}>{safeFormat(originalLanding, 'h:mm a')}</Text>{' '}
          <Text style={styles.delayedTime}>{safeFormat(ride.estimated_landing, 'h:mm a')}</Text>
        </Text>
      ) : (
        <Text style={styles.landingRow}>Estimated landing: {safeFormat(ride.estimated_landing, 'h:mm a')}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flightNumber: {
    ...Typography.h3,
    color: Colors.text,
  },
  route: {
    ...Typography.body,
    color: Colors.subtext,
    marginTop: Spacing.xs,
  },
  badgeRow: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  landingRow: {
    ...Typography.body,
    color: Colors.text,
  },
  strikethrough: {
    color: Colors.subtext,
    textDecorationLine: 'line-through',
  },
  delayedTime: {
    color: Colors.accent,
    fontWeight: '700',
  },
});
