import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { PlaceholderNote } from '@/components/shared/PlaceholderNote';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useFlightInfo } from '@/hooks/useFlightInfo';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useRideStore } from '@/store/rideStore';
import type { DriverProfile, Ride, RidePassenger } from '@/types';
import { isPendingRideExpired, rideStatusLabel, rideStatusVariant, safeFormat } from '@/utils';

const YWG_COORDS = { latitude: 49.91, longitude: -97.2398 };
const LIVE_STATUSES = ['driver_en_route', 'at_airport', 'in_progress'];

interface DriverInfo {
  full_name: string;
  phone: string;
  avatar_url: string | null;
}

export default function RideStatusScreen() {
  const [ride, setRide] = useState<Ride | null>(null);
  const [passenger, setPassenger] = useState<RidePassenger | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingSaving, setRatingSaving] = useState(false);

  const loadRide = useCallback(async () => {
    const user = useAuthStore.getState().user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: passengerRows } = await supabase
      .from('ride_passengers')
      .select('*')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const passengerRow = (passengerRows ?? [])[0] as RidePassenger | undefined;
    if (!passengerRow) {
      setPassenger(null);
      setRide(null);
      setLoading(false);
      return;
    }

    setPassenger(passengerRow);
    const { data: rideRow } = await supabase.from('rides').select('*').eq('id', passengerRow.ride_id).maybeSingle();
    setRide((rideRow as Ride) ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRide();
    }, [loadRide])
  );

  // Live updates while this screen is open (driver assignment, status changes).
  useEffect(() => {
    if (!ride?.id) return;
    const channel = supabase
      .channel(`ride-${ride.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` },
        (payload) => setRide(payload.new as Ride)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ride?.id]);

  useEffect(() => {
    if (!ride?.driver_id) {
      setDriverProfile(null);
      setDriverInfo(null);
      return;
    }
    supabase
      .from('driver_profiles')
      .select('*')
      .eq('id', ride.driver_id)
      .maybeSingle()
      .then(({ data }) => setDriverProfile(data as DriverProfile | null));
    supabase
      .from('profiles')
      .select('full_name, phone, avatar_url')
      .eq('id', ride.driver_id)
      .maybeSingle()
      .then(({ data }) => setDriverInfo(data as DriverInfo | null));
  }, [ride?.driver_id]);

  // Poll the driver's live location while a location is actually meaningful to show.
  useEffect(() => {
    if (!ride?.driver_id || !LIVE_STATUSES.includes(ride.status)) {
      setDriverLocation(null);
      return;
    }

    const fetchLocation = async () => {
      const { data } = await supabase
        .from('driver_location')
        .select('latitude, longitude')
        .eq('driver_id', ride.driver_id as string)
        .maybeSingle();
      if (data) {
        setDriverLocation({ latitude: Number(data.latitude), longitude: Number(data.longitude) });
      }
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 10000);
    return () => clearInterval(interval);
  }, [ride?.driver_id, ride?.status]);

  const { data: liveFlight } = useFlightInfo(ride?.flight_number ?? '', ride?.departure_date ?? '', !!ride);

  const landingDate = ride ? new Date(ride.estimated_landing) : null;
  const pickupWindowEnd = safeFormat(
    landingDate && !Number.isNaN(landingDate.getTime())
      ? new Date(landingDate.getTime() + 60 * 60000).toISOString()
      : null,
    'h:mm a'
  );

  const handleAtArrivals = async () => {
    await useRideStore.getState().updatePassengerStatus('at_arrivals');
    loadRide();
  };

  const handleDeleteExpired = () => {
    Alert.alert(
      'Delete this trip?',
      "This flight's date has passed and no driver was ever assigned. Deleting removes it from your trips so you can book a new ride.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await useRideStore.getState().cancelBooking();
            loadRide();
          },
        },
      ]
    );
  };

  const handleMissedConnection = () => {
    Alert.alert(
      'Missed your connection?',
      "This cancels your current booking so you can search for your new flight. We'll only need the flight that actually gets you to Winnipeg.",
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Cancel & Rebook',
          style: 'destructive',
          onPress: async () => {
            await useRideStore.getState().cancelBooking();
            router.replace('/(student)/book');
          },
        },
      ]
    );
  };

  const handleRate = async (stars: number) => {
    if (!passenger) return;
    setRatingSaving(true);
    try {
      await supabase.from('ride_passengers').update({ rating_given: stars }).eq('id', passenger.id);
      setPassenger({ ...passenger, rating_given: stars });
    } finally {
      setRatingSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer title="My Ride" edges={['top', 'left', 'right']}>
        <ActivityIndicator color={Colors.primary} />
      </ScreenContainer>
    );
  }

  if (!ride || !passenger) {
    return (
      <ScreenContainer title="My Ride" edges={['top', 'left', 'right']}>
        <PlaceholderNote text="You don't have a ride booked yet." icon="car-outline" />
        <Button label="Book a Ride" onPress={() => router.push('/(student)/book')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="My Ride" edges={['top', 'left', 'right']}>
      <StatusBadge
        label={isPendingRideExpired(ride) ? 'Expired' : rideStatusLabel(ride.status)}
        variant={isPendingRideExpired(ride) ? 'danger' : rideStatusVariant(ride.status)}
      />

      {ride.status === 'pending_driver' && isPendingRideExpired(ride) ? (
        <>
          <Card style={styles.searchingCard}>
            <Ionicons name="alert-circle-outline" size={32} color={Colors.subtext} />
            <Text style={styles.searchingTitle}>This Trip Expired</Text>
            <Text style={styles.searchingBody}>
              We couldn't find you a driver before your flight's date passed.
            </Text>
          </Card>
          <Card>
            <SummaryRow label="Flight" value={`${ride.flight_number} · ${safeFormat(ride.departure_date, 'MMM d, yyyy')}`} />
            <SummaryRow label="Dropoff" value={ride.dropoff_area} />
          </Card>
          <Button label="Delete" variant="secondary" onPress={handleDeleteExpired} />
        </>
      ) : null}

      {ride.status === 'pending_driver' && !isPendingRideExpired(ride) ? (
        <>
          <Card style={styles.searchingCard}>
            <ActivityIndicator color={Colors.primary} style={styles.searchingSpinner} />
            <Text style={styles.searchingTitle}>Finding you a driver...</Text>
            <Text style={styles.searchingBody}>We'll notify you as soon as a driver is assigned.</Text>
          </Card>
          <Card>
            <SummaryRow label="Flight" value={`${ride.flight_number} · ${safeFormat(ride.departure_date, 'MMM d, yyyy')}`} />
            <SummaryRow label="Landing" value={safeFormat(ride.estimated_landing, 'h:mm a')} />
            <SummaryRow label="Dropoff" value={ride.dropoff_area} />
            <SummaryRow label="Luggage" value={`${passenger.large_bags} large, ${passenger.carry_ons} carry-on`} />
          </Card>
          <Button label="I Missed My Connection" variant="secondary" onPress={handleMissedConnection} />
        </>
      ) : null}

      {ride.status === 'confirmed' ? (
        <>
          <Card>
            <View style={styles.driverRow}>
              {driverInfo?.avatar_url ? null : (
                <Ionicons name="person-circle" size={48} color={Colors.subtext} />
              )}
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driverInfo?.full_name ?? 'Driver'}</Text>
                <Text style={styles.driverMeta}>★ {driverProfile?.rating?.toFixed(1) ?? '5.0'}</Text>
              </View>
            </View>
            <SummaryRow
              label="Vehicle"
              value={`${driverProfile?.vehicle_color ?? ''} ${driverProfile?.vehicle_make ?? ''} ${driverProfile?.vehicle_model ?? ''}`}
            />
            <SummaryRow label="Plate" value={driverProfile?.vehicle_plate ?? '—'} />
          </Card>
          {liveFlight ? (
            <Card>
              <SummaryRow label="Flight Status" value={liveFlight.status} />
              <SummaryRow label="Estimated Landing" value={safeFormat(liveFlight.estimated_arrival, 'h:mm a')} />
            </Card>
          ) : null}
          <Card>
            <SummaryRow label="Estimated Pickup" value={`${safeFormat(ride.estimated_landing, 'h:mm a')} – ${pickupWindowEnd}`} />
          </Card>
          {driverInfo?.phone ? (
            <Button
              label="Contact Driver"
              variant="secondary"
              icon="call-outline"
              onPress={() => Linking.openURL(`tel:${driverInfo.phone}`)}
            />
          ) : null}
        </>
      ) : null}

      {ride.status === 'driver_en_route' ? (
        <>
          {driverLocation ? (
            <MapView
              style={styles.map}
              initialRegion={{ ...driverLocation, latitudeDelta: 0.1, longitudeDelta: 0.1 }}
            >
              <Marker coordinate={driverLocation} title="Your driver" pinColor={Colors.primary} />
              <Marker coordinate={YWG_COORDS} title="Winnipeg Airport" pinColor={Colors.accent} />
            </MapView>
          ) : (
            <PlaceholderNote text="Waiting for your driver's live location..." icon="navigate-outline" />
          )}
          <Card>
            <SummaryRow
              label="Vehicle"
              value={`${driverProfile?.vehicle_color ?? ''} ${driverProfile?.vehicle_make ?? ''} ${driverProfile?.vehicle_model ?? ''}`}
            />
            <SummaryRow label="Plate" value={driverProfile?.vehicle_plate ?? '—'} />
          </Card>
          <Button
            label="I'm at Arrivals"
            onPress={handleAtArrivals}
            disabled={liveFlight?.status !== 'landed'}
          />
          {liveFlight?.status !== 'landed' ? (
            <Text style={styles.hint}>This unlocks once your flight has landed.</Text>
          ) : null}
        </>
      ) : null}

      {ride.status === 'at_airport' || ride.status === 'in_progress' ? (
        <>
          <Card style={styles.searchingCard}>
            <Text style={styles.searchingTitle}>Your driver is waiting for you</Text>
            <Text style={styles.searchingBody}>{ride.pickup_location}</Text>
          </Card>
          {driverLocation ? (
            <MapView style={styles.map} initialRegion={{ ...driverLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 }}>
              <Marker coordinate={driverLocation} title="Your driver" pinColor={Colors.primary} />
            </MapView>
          ) : null}
        </>
      ) : null}

      {ride.status === 'completed' ? (
        <>
          <Card>
            <Text style={styles.searchingTitle}>Trip Complete</Text>
            <SummaryRow label="Flight" value={ride.flight_number} />
            <SummaryRow label="Dropoff" value={ride.dropoff_area} />
            <SummaryRow label="Total Paid" value={`$${(passenger.seat_fare / 100).toFixed(2)}`} />
          </Card>
          <Card>
            <Text style={styles.ratingPrompt}>How was your ride?</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => handleRate(star)} disabled={ratingSaving}>
                  <Ionicons
                    name={(passenger.rating_given ?? 0) >= star ? 'star' : 'star-outline'}
                    size={32}
                    color={Colors.accent}
                    style={styles.star}
                  />
                </Pressable>
              ))}
            </View>
          </Card>
          <Button label="Book Another Ride" onPress={() => router.push('/(student)/book')} />
        </>
      ) : null}
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
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
  searchingCard: {
    alignItems: 'center',
  },
  searchingSpinner: {
    marginBottom: Spacing.sm,
  },
  searchingTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  searchingBody: {
    ...Typography.body,
    color: Colors.subtext,
    textAlign: 'center',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  driverInfo: {
    marginLeft: Spacing.sm,
  },
  driverName: {
    ...Typography.h3,
    color: Colors.text,
  },
  driverMeta: {
    ...Typography.caption,
    color: Colors.subtext,
  },
  map: {
    width: '100%',
    height: 220,
    borderRadius: Radii.card,
  },
  hint: {
    ...Typography.caption,
    color: Colors.subtext,
    textAlign: 'center',
  },
  ratingPrompt: {
    ...Typography.h3,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  star: {
    marginHorizontal: Spacing.xs,
  },
});
