import { View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/shared/Card';
import { ProfileMenuRow } from '@/components/shared/ProfileMenuRow';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function DriverProfileScreen() {
  const signOut = useAuthStore((state) => state.signOut);

  const handleLogout = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <ScreenContainer
      title="Profile"
      subtitle="Keep your vehicle and documents up to date to stay approved."
      edges={['top', 'left', 'right']}
    >
      <Card padded={false}>
        <ProfileMenuRow icon="car-outline" label="Vehicle Info" />
        <ProfileMenuRow icon="document-text-outline" label="Documents" />
        <ProfileMenuRow icon="cash-outline" label="Payout Account" />
        <ProfileMenuRow icon="star-outline" label="Ratings" />
        <ProfileMenuRow icon="help-circle-outline" label="Help & Support" />
      </Card>
      <View style={{ marginTop: Spacing.sm }}>
        <Card padded={false}>
          <ProfileMenuRow icon="log-out-outline" label="Log Out" destructive showChevron={false} onPress={handleLogout} />
        </Card>
      </View>
    </ScreenContainer>
  );
}
