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

export default function StudentDocumentsScreen() {
  const [studentId, setStudentId] = useState<PickedDocument | null>(null);
  const [acceptanceLetter, setAcceptanceLetter] = useState<PickedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!studentId && !!acceptanceLetter;

  const handleSubmit = async () => {
    const user = useAuthStore.getState().user;
    if (!user || !studentId || !acceptanceLetter) return;

    setError(null);
    setLoading(true);
    try {
      const studentIdPath = `${user.id}/student-id.${extensionOf(studentId.name)}`;
      const acceptancePath = `${user.id}/acceptance-letter.${extensionOf(acceptanceLetter.name)}`;

      await uploadDocument('student-docs', studentIdPath, studentId);
      await uploadDocument('student-docs', acceptancePath, acceptanceLetter);

      const { error: updateError } = await supabase
        .from('student_profiles')
        .update({ student_id_url: studentIdPath, acceptance_letter_url: acceptancePath })
        .eq('id', user.id);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await useAuthStore.getState().refreshProfile();
      router.replace('/(student)/home');
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
      title="Verify Your Enrollment"
      subtitle="Upload these two documents so we can confirm you're a Brandon University student."
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
      <DocumentPickerRow label="Student ID" file={studentId} onPick={setStudentId} />
      <DocumentPickerRow label="Acceptance Letter" file={acceptanceLetter} onPick={setAcceptanceLetter} />
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
