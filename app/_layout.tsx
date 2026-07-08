import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

const queryClient = new QueryClient();

// @stripe/stripe-react-native has no web support; metro.config.js stubs it out of the web bundle.
function AppProviders({ children }: { children: React.ReactElement }) {
  if (Platform.OS === 'web') {
    return children;
  }
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}>
      {children}
    </StripeProvider>
  );
}

export default function RootLayout() {
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    useAuthStore.getState().initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppProviders>
            {isInitialized ? (
              <Stack screenOptions={{ headerShown: false }} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            )}
          </AppProviders>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
