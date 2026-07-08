import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/shared/Button';
import { DocumentPickerRow, type PickedDocument } from '@/components/shared/DocumentPickerRow';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { supabase, uploadDocument } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

function extensionOf(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'dat';
}

export default function DriverDocumentsScreen() {
  const [license, setLicense] = useState<PickedDocument | null>(null);
  const [insurance, setInsurance] = useState<PickedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!license && !!insurance;

  const handleSubmit = async () => {
    const user = useAuthStore.getState().user;
    if (!user || !license || !insurance) return;

    setError(null);
    setLoading(true);
    try {
      const licensePath = `${user.id}/license.${extensionOf(license.name)}`;
      const insurancePath = `${user.id}/insurance.${extensionOf(insurance.name)}`;

      await uploadDocument('driver-docs', licensePath, license);
      await uploadDocument('driver-docs', insurancePath, insurance);

      const { error: updateError } = await supabase
        .from('driver_profiles')
        .update({ license_url: licensePath, insurance_url: insurancePath })
        .eq('id', user.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await useAuthStore.getState().refreshProfile();
      router.replace('/(auth)/pending-approval');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await useAuthStore.getState().signOut();
    router.replace('/');
  };

  return (
    <ScreenContainer
      title="Verify Your Documents"
      subtitle="Upload your license and insurance so we can approve you to drive."
      footer={
        <>
          <Button label="Upload & Continue" onPress={handleSubmit} disabled={!canSubmit} loading={loading} />
          <Text style={styles.link} onPress={handleLogout}>
            Not ready? <Text style={styles.linkAccent}>Log out and finish later</Text>
          </Text>
        </>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <DocumentPickerRow label="Driver's License" file={license} onPick={setLicense} />
      <DocumentPickerRow label="Vehicle Insurance" file={insurance} onPick={setInsurance} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
