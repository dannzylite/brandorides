import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { differenceInSeconds, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { PlaceholderNote } from '@/components/shared/PlaceholderNote';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MAP_COORDS, PRICING, TIMING, VEHICLE_CLASS_LABELS } from '@/constants';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { acceptTripOffer, declineTripOffer, getRideWithPassengers, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { Ride, RidePassenger, TripOffer } from '@/types';
import { calculateDriverLeaveTime, calculateReturnToBrandon, driverQualifiesForRide, safeFormat } from '@/utils';

const MAP_REGION = {
  latitude: (MAP_COORDS.brandon.latitude + MAP_COORDS.winnipegAirport.latitude) / 2,
  longitude: (MAP_COORDS.brandon.longitude + MAP_COORDS.winnipegAirport.longitude) / 2,
  latitudeDelta: Math.abs(MAP_COORDS.brandon.latitude - MAP_COORDS.winnipegAirport.latitude) + 0.4,
  longitudeDelta: Math.abs(MAP_COORDS.brandon.longitude - MAP_COORDS.winnipegAirport.longitude) + 0.4,
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TripOfferScreen() {
  const { offerId } = useLocalSearchParams<{ offerId?: string }>();
  const driverProfile = useAuthStore((state) => state.driverProfile);

  const [offer, setOffer] = useState<TripOffer | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [passengers, setPassengers] = useState<RidePassenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    if (!offerId) {
      setLoading(false);
      return;
    }
    const { data: offerRow } = await supabase.from('trip_offers').select('*').eq('id', offerId).maybeSingle();
    setOffer((offerRow as TripOffer) ?? null);

    if (offerRow) {
      const { ride: rideRow, passengers: passengerRows } = await getRideWithPassengers(offerRow.ride_id);
      setRide(rideRow);
      setPassengers(passengerRows);
    }
    setLoading(false);
  }, [offerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = async () => {
    if (!offer) return;
    setResponding(true);
    setOffer({ ...offer, status: 'accepted' });
    try {
      const result = await acceptTripOffer(offer.id);
      if (result.success) {
        router.replace('/(driver)/(tabs)/home');
        return;
      }
      setOffer({ ...offer, status: 'pending' });
      if (result.reason === 'ride_already_claimed') {
        Alert.alert('Trip Unavailable', 'Sorry, this trip was just claimed by another driver.');
      } else {
        Alert.alert('Trip Unavailable', 'This offer is no longer available.');
      }
      await load();
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = () => {
    if (!offer) return;
    Alert.alert('Are you sure?', 'Declining affects your offer priority.', [
      { text: 'Keep Offer', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setResponding(true);
          try {
            await declineTripOffer(offer.id);
            router.back();
          } finally {
            setResponding(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ScreenContainer title="Trip Offer" edges={['top', 'left', 'right', 'bottom']}>
        <PlaceholderNote text="Loading offer..." icon="hourglass-outline" />
      </ScreenContainer>
    );
  }

  if (!offer || !ride) {
    return (
      <ScreenContainer title="Trip Offer" edges={['top', 'left', 'right', 'bottom']}>
        <PlaceholderNote text="This offer is no longer active." icon="alert-circle-outline" />
        <Button label="Back to Home" variant="secondary" onPress={() => router.replace('/(driver)/(tabs)/home')} />
      </ScreenContainer>
    );
  }

  const elapsedSeconds = Math.max(0, differenceInSeconds(now, parseISO(offer.offered_at)));
  const timerColor =
    elapsedSeconds < 15 * 60 ? Colors.primaryLight : elapsedSeconds < 30 * 60 ? Colors.accent : Colors.danger;
  const timerMinutes = Math.floor(elapsedSeconds / 60);
  const timerSeconds = elapsedSeconds % 60;

  const combinedLuggageUnits = passengers.reduce((sum, p) => sum + p.luggage_units, 0);
  const qualifies = driverProfile ? driverQualifiesForRide(driverProfile, ride, combinedLuggageUnits) : false;

  const fareTotal = passengers.reduce((sum, p) => sum + p.seat_fare, 0);
  const platformFee = Math.round(fareTotal * (PRICING.platform_fee_percent / 100));
  const driverEarnings = fareTotal - platformFee;

  const isPending = offer.status === 'pending';

  return (
    <ScreenContainer
      title="Trip Offer"
      subtitle={safeFormat(ride.departure_date, 'EEEE, MMMM d')}
      edges={['top', 'left', 'right', 'bottom']}
      footer={
        isPending ? (
          <>
            <Button label="ACCEPT TRIP" onPress={handleAccept} loading={responding} />
            <Button label="Decline" variant="secondary" onPress={handleDecline} disabled={responding} style={styles.declineButton} />
          </>
        ) : (
          <Button label="Back to Home" variant="secondary" onPress={() => router.replace('/(driver)/(tabs)/home')} />
        )
      }
    >
      {isPending ? (
        <View style={styles.timerRow}>
          <Ionicons name="time-outline" size={18} color={timerColor} />
          <Text style={[styles.timerText, { color: timerColor }]}>
            {timerMinutes}:{timerSeconds.toString().padStart(2, '0')} on offer
          </Text>
        </View>
      ) : (
        <StatusBadge
          label={offer.status === 'accepted' ? 'Accepted' : offer.status === 'expired' ? 'Expired' : 'Declined'}
          variant={offer.status === 'accepted' ? 'success' : 'neutral'}
        />
      )}

      <Card>
        <SummaryRow label="Students" value={String(passengers.length)} />
        {passengers.map((p, i) => (
          <SummaryRow
            key={p.id}
            label={`Passenger ${i + 1}`}
            value={`${p.large_bags} large, ${p.carry_ons} carry-on${p.oversized_items ? ', oversized' : ''} (${p.luggage_units} units)`}
          />
        ))}
        <SummaryRow label="Combined Luggage" value={`${combinedLuggageUnits} units`} />
        <View style={styles.vehicleRow}>
          <Text style={styles.rowLabel}>Vehicle Required</Text>
          <View style={styles.vehicleValueRow}>
            <Text style={styles.rowValue}>{VEHICLE_CLASS_LABELS[ride.vehicle_class_required]}</Text>
            <Ionicons
              name={qualifies ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={qualifies ? Colors.primaryLight : Colors.danger}
              style={styles.vehicleIcon}
            />
          </View>
        </View>
      </Card>

      <View>
        <Text style={styles.sectionLabel}>Earnings</Text>
        <Card>
          <SummaryRow label="Base Fare Total" value={formatCurrency(fareTotal)} />
          <SummaryRow label={`Platform Fee (${PRICING.platform_fee_percent}%)`} value={`-${formatCurrency(platformFee)}`} />
          <View style={styles.divider} />
          <SummaryRow label="Your Earnings" value={formatCurrency(driverEarnings)} />
          <Text style={styles.waitFeeNote}>
            Wait fees may apply after {PRICING.free_wait_minutes} min free wait.
          </Text>
        </Card>
      </View>

      <View>
        <Text style={styles.sectionLabel}>Timing</Text>
        <Card>
          <SummaryRow label="Leave Brandon By" value={safeFormat(calculateDriverLeaveTime(ride.estimated_landing)?.toISOString(), 'h:mm a')} />
          <SummaryRow label="Estimated Return" value={safeFormat(calculateReturnToBrandon(ride.estimated_landing)?.toISOString(), 'h:mm a')} />
        </Card>
      </View>

      <View>
        <Text style={styles.sectionLabel}>Route</Text>
        <MapView style={styles.map} initialRegion={MAP_REGION}>
          <Marker coordinate={MAP_COORDS.brandon} title="Brandon" pinColor={Colors.primary} />
          <Marker coordinate={MAP_COORDS.winnipegAirport} title="Winnipeg Airport" pinColor={Colors.accent} />
          <Polyline coordinates={[MAP_COORDS.brandon, MAP_COORDS.winnipegAirport]} strokeColor={Colors.primary} strokeWidth={2} />
        </MapView>
        <Text style={styles.routeCaption}>
          Brandon → Winnipeg Airport → Brandon · ~{Math.round(TIMING.brandon_to_winnipeg_minutes / 60)} hr each way
        </Text>
      </View>
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
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  timerText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  rowLabel: {
    ...Typography.body,
    color: Colors.subtext,
    flex: 1,
  },
  rowValue: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'right',
  },
  vehicleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  vehicleValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIcon: {
    marginLeft: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.subtext,
    marginBottom: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  waitFeeNote: {
    ...Typography.micro,
    color: Colors.subtext,
    marginTop: Spacing.sm,
  },
  map: {
    width: '100%',
    height: 180,
    borderRadius: Radii.card,
  },
  routeCaption: {
    ...Typography.caption,
    color: Colors.subtext,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  declineButton: {
    marginTop: Spacing.sm,
  },
});
