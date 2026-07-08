import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function DriverLayout() {
  const { user, profile, driverProfile } = useAuthStore();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  if (profile?.role !== 'driver') {
    return <Redirect href="/" />;
  }
  if (!driverProfile) {
    return <Redirect href="/(auth)/driver-documents" />;
  }
  if (!driverProfile.is_approved) {
    return <Redirect href="/(auth)/pending-approval" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
