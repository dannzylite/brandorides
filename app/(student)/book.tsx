import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { Input } from '@/components/shared/Input';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { VEHICLE_CLASS_LABELS } from '@/constants';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useFlightInfo } from '@/hooks/useFlightInfo';
import { FLIGHT_NUMBER_REGEX } from '@/lib/aviationstack';
import { useRideStore } from '@/store/rideStore';
import type { RideType, VehicleClass } from '@/types';
import {
  calculateLuggageUnits,
  calculatePrice,
  recommendedVehicleClass,
  rideStatusLabel,
  rideStatusVariant,
  safeFormat,
  vehicleFitForLuggage,
} from '@/utils';

const TOTAL_STEPS = 4;
const MAX_ITEM_COUNT = 6;
const VEHICLE_ORDER: VehicleClass[] = ['sedan', 'suv', 'minivan', 'truck'];

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface CounterRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function CounterRow({ label, value, onChange }: CounterRowProps) {
  return (
    <View style={styles.counterRow}>
      <Text style={styles.counterLabel}>{label}</Text>
      <View style={styles.counterControls}>
        <Pressable
          style={[styles.counterButton, value === 0 && styles.counterButtonDisabled]}
          onPress={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
        >
          <Ionicons name="remove" size={18} color={value === 0 ? Colors.subtext : Colors.primary} />
        </Pressable>
        <Text style={styles.counterValue}>{value}</Text>
        <Pressable
          style={[styles.counterButton, value === MAX_ITEM_COUNT && styles.counterButtonDisabled]}
          onPress={() => onChange(Math.min(MAX_ITEM_COUNT, value + 1))}
          disabled={value === MAX_ITEM_COUNT}
        >
          <Ionicons name="add" size={18} color={value === MAX_ITEM_COUNT ? Colors.subtext : Colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function BookScreen() {
  const [step, setStep] = useState(1);

  // Step 1 — flight
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [searchParams, setSearchParams] = useState<{ flightNumber: string; date: string } | null>(null);
  const dateString = format(date, 'yyyy-MM-dd');
  const flightNumberValid = FLIGHT_NUMBER_REGEX.test(flightNumber.trim());
  const {
    data: flight,
    error: flightError,
    isFetching: isSearching,
  } = useFlightInfo(searchParams?.flightNumber ?? '', searchParams?.date ?? '', !!searchParams);
  // The date picker's minimumDate only blocks past calendar days — a flight
  // scheduled earlier *today* can still already have landed by the time you
  // search for it. Booking a ride for a flight that's already down broadcasts
  // a dead offer to every driver, so block it here rather than after the fact.
  const flightAlreadyLanded = !!flight && new Date(flight.estimated_arrival).getTime() < Date.now();

  // Step 2 — luggage
  const [largeBags, setLargeBags] = useState(0);
  const [carryOns, setCarryOns] = useState(0);
  const [oversizedItems, setOversizedItems] = useState(false);
  const luggageUnits = calculateLuggageUnits(largeBags, carryOns, oversizedItems);
  const vehicleFit = vehicleFitForLuggage(luggageUnits);
  const recommendedClass = recommendedVehicleClass(luggageUnits);

  // Step 3 — ride type + pricing
  const [rideType, setRideType] = useState<RideType>('shared');
  const [dropoffArea, setDropoffArea] = useState('');
  const vehicleClass: VehicleClass = recommendedClass ?? 'truck';
  const price = calculatePrice(rideType, vehicleClass, oversizedItems);

  // Step 4 — confirm
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const createBooking = useRideStore((state) => state.createBooking);
  const currentRide = useRideStore((state) => state.currentRide);

  // This tab screen stays mounted in the background when you switch tabs, so
  // without checking this a student returning to Book after confirming would
  // still see the filled-in Step 4 form with an active "Confirm Booking"
  // button — and tapping it again would create a second ride. Instead of
  // hiding the tab, show what they already booked (see render below) with a
  // way to view or cancel it.
  useFocusEffect(
    useCallback(() => {
      useRideStore.getState().fetchMyActiveRide();
    }, [])
  );

  const handleCancel = () => {
    Alert.alert('Cancel this booking?', 'You can book a new ride right after.', [
      { text: 'Keep Booking', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await useRideStore.getState().cancelBooking();
            resetForm();
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const resetForm = () => {
    setStep(1);
    setFlightNumber('');
    setDate(new Date());
    setSearchParams(null);
    setLargeBags(0);
    setCarryOns(0);
    setOversizedItems(false);
    setRideType('shared');
    setDropoffArea('');
    setSubmitError(null);
  };

  const handleFindFlight = () => {
    setSearchParams({ flightNumber, date: dateString });
  };

  const handleConfirm = async () => {
    if (!flight) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createBooking({
        flightNumber,
        departureDate: dateString,
        flightInfo: flight,
        largeBags,
        carryOns,
        oversizedItems,
        rideType,
        dropoffArea,
      });
      resetForm();
      router.replace('/(student)/ride-status');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (currentRide) {
    return (
      <ScreenContainer title="Book a Ride" edges={['top', 'left', 'right']}>
        <Text style={styles.stepTitle}>You already have a ride booked</Text>
        <Card onPress={() => router.push('/(student)/ride-status')}>
          <View style={styles.reviewRow}>
            <Text style={styles.flightAirline}>{currentRide.flight_number}</Text>
            <StatusBadge label={rideStatusLabel(currentRide.status)} variant={rideStatusVariant(currentRide.status)} />
          </View>
          <Text style={styles.flightDetail}>
            {safeFormat(currentRide.departure_date, 'MMM d, yyyy')} · Landing{' '}
            {safeFormat(currentRide.estimated_landing, 'h:mm a')}
          </Text>
          <Text style={styles.flightDetail}>Dropoff: {currentRide.dropoff_area}</Text>
          <View style={styles.viewDetailsRow}>
            <Text style={styles.viewDetailsText}>View My Ride</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </View>
        </Card>
        <Button label="Cancel Booking" variant="secondary" onPress={handleCancel} loading={cancelling} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Book a Ride" edges={['top', 'left', 'right']}>
      <View style={styles.progressRow}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <View key={s} style={[styles.progressDot, s <= step && styles.progressDotActive]} />
        ))}
      </View>

      {step === 1 ? (
        <>
          <Text style={styles.stepTitle}>Flight Details</Text>
          <Input
            label="Flight Number"
            value={flightNumber}
            onChangeText={setFlightNumber}
            placeholder="e.g. AC855"
            autoCapitalize="characters"
          />
          <Pressable style={styles.dateField} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateLabel}>Arrival Date</Text>
            <Text style={styles.dateValue}>{format(date, 'MMM d, yyyy')}</Text>
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(_event, selected) => {
                setShowDatePicker(false);
                if (selected) setDate(selected);
              }}
            />
          ) : null}

          <Button
            label="Find My Flight"
            variant="secondary"
            onPress={handleFindFlight}
            disabled={!flightNumberValid}
            loading={isSearching}
          />

          {flightError ? <Text style={styles.error}>{flightError.message}</Text> : null}

          {flight ? (
            <>
              <Card>
                <Text style={styles.flightAirline}>Final flight: {flight.flight_number}</Text>
                <Text style={styles.flightDetail}>
                  {flight.origin.name} ({flight.origin.code}) → {flight.destination.name} ({flight.destination.code})
                </Text>
                <Text style={styles.flightDetail}>
                  Departing: {safeFormat(flight.estimated_departure, 'h:mm a')} · Landing: ~
                  {safeFormat(flight.estimated_arrival, 'h:mm a')}
                </Text>
                <View style={styles.flightStatusRow}>
                  <StatusBadge label={flight.status} variant={flight.status === 'landed' ? 'success' : 'info'} />
                </View>
              </Card>
              {flightAlreadyLanded ? (
                <Text style={styles.error}>
                  This flight has already landed. Please search for an upcoming flight.
                </Text>
              ) : (
                <Card>
                  <Text style={styles.connectionPrompt}>
                    Is this your last flight to Winnipeg? If you have connections before this, that's fine — we
                    only need this one.
                  </Text>
                </Card>
              )}
            </>
          ) : null}

          <Button label="Continue" onPress={() => setStep(2)} disabled={!flight || flightAlreadyLanded} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Text style={styles.stepTitle}>Luggage Details</Text>
          <Card>
            <CounterRow label="Number of Big Bags" value={largeBags} onChange={setLargeBags} />
            <CounterRow label="Hand Carry Items (small)" value={carryOns} onChange={setCarryOns} />
            <View style={styles.oversizedRow}>
              <View style={styles.oversizedTextWrap}>
                <Text style={styles.counterLabel}>Oversized Items</Text>
                <Text style={styles.oversizedHint}>Bikes, large boxes, etc.</Text>
              </View>
              <Switch value={oversizedItems} onValueChange={setOversizedItems} trackColor={{ true: Colors.primaryLight }} />
            </View>
            {oversizedItems ? <Text style={styles.surchargeNote}>+$15 surcharge per item</Text> : null}
          </Card>

          <Card>
            <Text style={styles.unitsLabel}>Total Luggage Units</Text>
            <Text style={styles.unitsValue}>{luggageUnits}</Text>
          </Card>

          <View>
            <Text style={styles.stepTitle}>Vehicle Fit</Text>
            <Card>
              {VEHICLE_ORDER.map((vehicleKey) => (
                <View key={vehicleKey} style={styles.fitRow}>
                  <Text style={styles.fitLabel}>{VEHICLE_CLASS_LABELS[vehicleKey]}</Text>
                  <Ionicons
                    name={vehicleFit[vehicleKey] ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={vehicleFit[vehicleKey] ? Colors.primaryLight : Colors.danger}
                  />
                </View>
              ))}
            </Card>
          </View>

          <View style={styles.navRow}>
            <Button label="Back" variant="secondary" onPress={() => setStep(1)} style={styles.navButton} />
            <Button label="Continue" onPress={() => setStep(3)} style={styles.navButton} />
          </View>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Text style={styles.stepTitle}>Ride Type + Pricing</Text>
          <Text style={styles.recommendedText}>
            Recommended vehicle: {VEHICLE_CLASS_LABELS[vehicleClass]}
          </Text>

          <View style={styles.toggleRow}>
            <Button
              label="Shared Ride"
              variant={rideType === 'shared' ? 'primary' : 'secondary'}
              onPress={() => setRideType('shared')}
              style={styles.toggleButton}
            />
            <Button
              label="Solo Ride"
              variant={rideType === 'solo' ? 'primary' : 'secondary'}
              onPress={() => setRideType('solo')}
              style={styles.toggleButton}
            />
          </View>

          <Card>
            {rideType === 'shared' ? (
              <>
                <Text style={styles.priceHeadline}>{formatCurrency(price.baseFare)} / seat</Text>
                <Text style={styles.rideTypeDetail}>
                  You may share with up to {Math.max(0, VEHICLE_ORDER.indexOf(vehicleClass) >= 0 ? 3 : 0)} other students
                </Text>
                <Text style={styles.rideTypeDetail}>Matched with students on similar flights</Text>
                <Text style={styles.rideTypeDetail}>
                  Estimated savings vs solo: {formatCurrency(Math.max(0, calculatePrice('solo', vehicleClass, oversizedItems).total - price.total))}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.priceHeadline}>{formatCurrency(price.baseFare)} flat rate</Text>
                <Text style={styles.rideTypeDetail}>Guaranteed private vehicle</Text>
                <Text style={styles.rideTypeDetail}>Vehicle will be sized to your luggage</Text>
              </>
            )}
          </Card>

          <Input
            label="Dropoff Area"
            value={dropoffArea}
            onChangeText={setDropoffArea}
            placeholder="e.g. Brandon University campus"
          />

          <Card>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Base Fare</Text>
              <Text style={styles.priceValue}>{formatCurrency(price.baseFare)}</Text>
            </View>
            {oversizedItems ? (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Oversized Surcharge</Text>
                <Text style={styles.priceValue}>{formatCurrency(price.oversizedSurcharge)}</Text>
              </View>
            ) : null}
            <View style={styles.priceRow}>
              <Text style={styles.priceLabelTotal}>Total</Text>
              <Text style={styles.priceValueTotal}>{formatCurrency(price.total)}</Text>
            </View>
            <Text style={styles.waitFeeNote}>Wait fees may apply after 30 min free wait.</Text>
          </Card>

          <View style={styles.navRow}>
            <Button label="Back" variant="secondary" onPress={() => setStep(2)} style={styles.navButton} />
            <Button
              label="Continue"
              onPress={() => setStep(4)}
              disabled={!dropoffArea.trim()}
              style={styles.navButton}
            />
          </View>
        </>
      ) : null}

      {step === 4 && flight ? (
        <>
          <Text style={styles.stepTitle}>Review + Confirm</Text>
          <Card>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Flight</Text>
              <Text style={styles.reviewValue}>
                {flight.flight_number} on {format(date, 'MMM d, yyyy')}
              </Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Landing</Text>
              <Text style={styles.reviewValue}>{safeFormat(flight.estimated_arrival, 'h:mm a')}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Luggage</Text>
              <Text style={styles.reviewValue}>
                {largeBags} big bag{largeBags === 1 ? '' : 's'}, {carryOns} hand carry{oversizedItems ? ', oversized item' : ''}
              </Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Ride Type</Text>
              <Text style={styles.reviewValue}>{rideType === 'shared' ? 'Shared' : 'Solo'}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Vehicle</Text>
              <Text style={styles.reviewValue}>{VEHICLE_CLASS_LABELS[vehicleClass]}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Dropoff</Text>
              <Text style={styles.reviewValue}>{dropoffArea}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabelTotal}>Price</Text>
              <Text style={styles.reviewValueTotal}>{formatCurrency(price.total)}</Text>
            </View>
          </Card>

          {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

          <View style={styles.navRow}>
            <Button label="Back" variant="secondary" onPress={() => setStep(3)} style={styles.navButton} disabled={submitting} />
            <Button label="Confirm Booking" onPress={handleConfirm} loading={submitting} style={styles.navButton} />
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: Radii.pill,
    backgroundColor: Colors.border,
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
  },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  navButton: {
    flex: 1,
  },
  stepTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  dateField: {
    backgroundColor: Colors.inputBackground,
    borderRadius: Radii.input,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
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
  },
  flightAirline: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  flightDetail: {
    ...Typography.body,
    color: Colors.subtext,
    marginTop: Spacing.xs,
  },
  flightStatusRow: {
    marginTop: Spacing.sm,
    alignItems: 'flex-start',
  },
  connectionPrompt: {
    ...Typography.caption,
    color: Colors.subtext,
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
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  counterLabel: {
    ...Typography.body,
    color: Colors.text,
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  counterButton: {
    width: 32,
    height: 32,
    borderRadius: Radii.pill,
    backgroundColor: Colors.primaryPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonDisabled: {
    backgroundColor: Colors.inputBackground,
  },
  counterValue: {
    ...Typography.h3,
    color: Colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  oversizedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  oversizedTextWrap: {
    flex: 1,
  },
  oversizedHint: {
    ...Typography.caption,
    color: Colors.subtext,
  },
  surchargeNote: {
    ...Typography.caption,
    color: Colors.accent,
    marginTop: Spacing.xs,
  },
  unitsLabel: {
    ...Typography.caption,
    color: Colors.subtext,
  },
  unitsValue: {
    ...Typography.hero,
    color: Colors.primary,
  },
  fitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  fitLabel: {
    ...Typography.body,
    color: Colors.text,
  },
  recommendedText: {
    ...Typography.body,
    color: Colors.subtext,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  toggleButton: {
    flex: 1,
  },
  priceHeadline: {
    ...Typography.h2,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  rideTypeDetail: {
    ...Typography.caption,
    color: Colors.subtext,
    marginTop: Spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  priceLabel: {
    ...Typography.body,
    color: Colors.subtext,
  },
  priceValue: {
    ...Typography.body,
    color: Colors.text,
  },
  priceLabelTotal: {
    ...Typography.h3,
    color: Colors.text,
  },
  priceValueTotal: {
    ...Typography.h3,
    color: Colors.primary,
  },
  waitFeeNote: {
    ...Typography.micro,
    color: Colors.subtext,
    marginTop: Spacing.sm,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  reviewLabel: {
    ...Typography.caption,
    color: Colors.subtext,
  },
  reviewValue: {
    ...Typography.body,
    color: Colors.text,
  },
  reviewLabelTotal: {
    ...Typography.h3,
    color: Colors.text,
  },
  reviewValueTotal: {
    ...Typography.h3,
    color: Colors.primary,
  },
});
