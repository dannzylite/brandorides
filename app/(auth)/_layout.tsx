import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AuthLayout() {
  const user = useAuthStore((state) => state.user);
  const segments = useSegments();
  const leaf = segments[segments.length - 1];

  // Only bounce away from login when already signed in (e.g. revisiting it
  // with an existing session). register.tsx always navigates itself right
  // after signup (to document upload, or back to login if email
  // confirmation is pending) — if this guard also covered 'register', the
  // store update register.tsx triggers right before its own router.replace
  // would race this redirect and win, sending a brand-new student straight
  // to '/' — which skips document upload entirely, since root routing
  // doesn't gate students on it. The rest of this group (document upload,
  // pending-approval) requires an authenticated user to render at all, so
  // it must never be redirected away either.
  if (user && leaf === 'login') {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="pending-approval" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
