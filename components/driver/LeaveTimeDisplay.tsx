import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/shared/Card';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Ride } from '@/types';
import { safeFormat } from '@/utils';

interface LeaveTimeDisplayProps {
  ride: Ride;
}

const TICK_MS = 30_000;
const YELLOW = '#F2C94C';

function colorForRemaining(msRemaining: number): string {
  const hoursRemaining = msRemaining / 3_600_000;
  if (hoursRemaining > 2) return Colors.primaryLight; // green
  if (hoursRemaining > 1) return YELLOW;
  if (hoursRemaining > 0.5) return Colors.accent; // orange
  return Colors.danger; // red — under 30 min or already past
}

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'LEAVE NOW';
  const totalMinutes = Math.round(msRemaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `In ${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `In ${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function LeaveTimeDisplay({ ride: initialRide }: LeaveTimeDisplayProps) {
  const [ride, setRide] = useState(initialRide);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setRide(initialRide);
  }, [initialRide]);

  // Real-time: a delay pushed by flight-monitor updates driver_leave_time
  // instantly, without the driver needing to refresh the screen.
  useEffect(() => {
    const channel = supabase
      .channel(`leave-time-${initialRide.id}`)
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

  // The countdown itself needs to advance even when nothing in the DB
  // changes — a plain timer ticks the "remaining" calculation forward.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  if (!ride.driver_leave_time) return null;

  const leaveTime = new Date(ride.driver_leave_time).getTime();
  const msRemaining = leaveTime - now;
  const color = colorForRemaining(msRemaining);

  return (
    <Card>
      <Text style={styles.label}>Leave Brandon by</Text>
      <Text style={[styles.time, { color }]}>{safeFormat(ride.driver_leave_time, 'h:mm a')}</Text>
      <Text style={[styles.subtitle, { color }]}>{formatCountdown(msRemaining)}</Text>
      <Text style={styles.hint}>
        Based on flight landing at {safeFormat(ride.estimated_landing, 'h:mm a')} + 60 min customs buffer
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    ...Typography.caption,
    color: Colors.subtext,
  },
  time: {
    ...Typography.hero,
    marginTop: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  hint: {
    ...Typography.micro,
    color: Colors.subtext,
    marginTop: Spacing.sm,
  },
});
