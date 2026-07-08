import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { VEHICLE_CAPACITY, VEHICLE_CLASS_LABELS } from '@/constants';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { UserRole, VehicleClass } from '@/types';

const VEHICLE_CLASSES = Object.keys(VEHICLE_CAPACITY) as VehicleClass[];

export default function RegisterScreen() {
  const [role, setRole] = useState<UserRole>('student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('sedan');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    setError(null);

    if (!fullName || !email || !phone || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (role === 'driver') {
      const year = Number(vehicleYear);
      if (!vehicleMake || !vehicleModel || !vehicleColor || !vehiclePlate || !year) {
        setError('Please fill in all vehicle details.');
        return;
      }
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName, phone, role } },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!data.session || !data.user) {
        setError('Check your email to confirm your account, then log in.');
        router.replace('/(auth)/login');
        return;
      }

      if (role === 'driver') {
        const capacity = VEHICLE_CAPACITY[vehicleClass];
        const { error: driverError } = await supabase.from('driver_profiles').insert({
          id: data.user.id,
          vehicle_make: vehicleMake,
          vehicle_model: vehicleModel,
          vehicle_year: Number(vehicleYear),
          vehicle_color: vehicleColor,
          vehicle_plate: vehiclePlate,
          vehicle_class: vehicleClass,
          max_passengers: capacity.max_passengers,
          max_luggage_units: capacity.max_luggage_units,
        });

        if (driverError) {
          setError(driverError.message);
          return;
        }
      }

      useAuthStore.getState().setUser(data.user);
      await useAuthStore.getState().refreshProfile();

      router.replace(role === 'student' ? '/(auth)/student-documents' : '/(auth)/driver-documents');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer
      title="Create Your Account"
      subtitle="Set up your profile so your ride is ready before you land."
      footer={
        <>
          <Button label="Create Account" onPress={handleRegister} loading={loading} />
          <Text style={styles.link} onPress={() => router.push('/(auth)/login')}>
            Already have an account? <Text style={styles.linkAccent}>Log in</Text>
          </Text>
        </>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.toggleRow}>
        <Button
          label="I'm a Student"
          variant={role === 'student' ? 'primary' : 'secondary'}
          onPress={() => setRole('student')}
          style={styles.toggleButton}
        />
        <Button
          label="I'm a Driver"
          variant={role === 'driver' ? 'primary' : 'secondary'}
          onPress={() => setRole('driver')}
          style={styles.toggleButton}
        />
      </View>

      <Input label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Jane Student" autoCapitalize="words" />
      <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
      <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="(204) 555-0100" keyboardType="phone-pad" />
      <Input label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
      <Input
        label="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="••••••••"
        secureTextEntry
      />

      {role === 'student' ? (
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyLabel}>University</Text>
          <Text style={styles.readOnlyValue}>Brandon University</Text>
        </View>
      ) : (
        <>
          <Input label="Vehicle Make" value={vehicleMake} onChangeText={setVehicleMake} placeholder="Toyota" autoCapitalize="words" />
          <Input label="Vehicle Model" value={vehicleModel} onChangeText={setVehicleModel} placeholder="Sienna" autoCapitalize="words" />
          <Input label="Vehicle Year" value={vehicleYear} onChangeText={setVehicleYear} placeholder="2022" keyboardType="number-pad" />
          <Input label="Vehicle Color" value={vehicleColor} onChangeText={setVehicleColor} placeholder="Black" autoCapitalize="words" />
          <Input
            label="Vehicle Plate Number"
            value={vehiclePlate}
            onChangeText={setVehiclePlate}
            placeholder="ABC 123"
            autoCapitalize="characters"
          />

          <Text style={styles.readOnlyLabel}>Vehicle Class</Text>
          <View style={styles.classGrid}>
            {VEHICLE_CLASSES.map((option) => (
              <Button
                key={option}
                label={VEHICLE_CLASS_LABELS[option]}
                variant={vehicleClass === option ? 'primary' : 'secondary'}
                onPress={() => setVehicleClass(option)}
                style={styles.classButton}
              />
            ))}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  toggleButton: {
    flex: 1,
  },
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  classButton: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  readOnlyField: {
    backgroundColor: Colors.inputBackground,
    borderRadius: Radii.input,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  readOnlyLabel: {
    ...Typography.caption,
    color: Colors.subtext,
    marginBottom: Spacing.xs,
  },
  readOnlyValue: {
    ...Typography.body,
    color: Colors.text,
  },
  error: {
    ...Typography.caption,
    color: Colors.danger,
  },
  link: {
    ...Typography.caption,
    color: Colors.subtext,
    textAlign: 'center',
    marginTop: Spacing.base,
  },
  linkAccent: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
