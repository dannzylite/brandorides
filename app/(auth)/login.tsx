import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { ScreenContainer } from '@/components/shared/ScreenContainer';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function LoginScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }

    router.replace('/');
  };

  return (
    <ScreenContainer
      title="Welcome Back"
      subtitle="Log in to get from Winnipeg airport to Brandon, hassle-free."
      footer={
        <>
          <Button label="Log In" onPress={handleLogin} loading={loading} />
          <Text style={styles.link} onPress={() => router.push('/(auth)/register')}>
            New here? <Text style={styles.linkAccent}>Create an account</Text>
          </Text>
        </>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
      />
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
