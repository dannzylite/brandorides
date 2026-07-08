import { View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/shared/Card';
import { ProfileMenuRow } from '@/components/shared/ProfileMenuRow';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function StudentProfileScreen() {
  const signOut = useAuthStore((state) => state.signOut);

  const handleLogout = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <ScreenContainer
      title="Profile"
      subtitle="Manage your info and travel documents for a smoother pickup."
      edges={['top', 'left', 'right']}
    >
      <Card padded={false}>
        <ProfileMenuRow icon="person-outline" label="Personal Info" />
        <ProfileMenuRow icon="document-text-outline" label="Travel Documents" />
        <ProfileMenuRow icon="card-outline" label="Payment Methods" />
        <ProfileMenuRow icon="notifications-outline" label="Notifications" />
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
