import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../theme/colors';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === 'login';
    if (status === 'authenticated' && inAuthGroup) {
      router.replace('/');
    } else if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/login');
    }
  }, [status, segments, router]);

  if (status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <AuthGate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
