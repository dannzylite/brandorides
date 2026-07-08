import { Redirect, router } from 'expo-router';
import { Text } from 'react-native';
import { Button } from '@/components/shared/Button';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Colors, Typography } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const { user, profile, driverProfile, studentProfile } = useAuthStore();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!profile) {
    // Brief gap between the session resolving and refreshProfile() completing.
    return null;
  }

  if (profile.role === 'admin') {
    return (
      <ScreenContainer
        title="Admin Access"
        subtitle="BrandoRides admin tools live on the web panel."
        footer={
          <Button
            label="Sign Out"
            variant="secondary"
            onPress={async () => {
              await useAuthStore.getState().signOut();
              router.replace('/');
            }}
          />
        }
      >
        <Text style={{ ...Typography.body, color: Colors.subtext }}>
          Log in to the BrandoRides admin dashboard from a browser to manage rides, drivers, and
          students.
        </Text>
      </ScreenContainer>
    );
  }

  if (profile.role === 'driver') {
    if (!driverProfile) {
      return <Redirect href="/(auth)/driver-documents" />;
    }
    if (!driverProfile.is_approved) {
      return <Redirect href="/(auth)/pending-approval" />;
    }
    return <Redirect href="/(driver)/(tabs)/home" />;
  }

  if (!studentProfile?.student_id_url || !studentProfile?.acceptance_letter_url) {
    return <Redirect href="/(auth)/student-documents" />;
  }
  return <Redirect href="/(student)/home" />;
}
