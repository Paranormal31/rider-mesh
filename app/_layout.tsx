import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { appRuntimeService } from '@/src/services';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void appRuntimeService.startForegroundRuntime();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void appRuntimeService.startForegroundRuntime();
      } else {
        appRuntimeService.stopForegroundRuntime();
      }
    });

    return () => {
      subscription.remove();
      appRuntimeService.stopForegroundRuntime();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="emergency-contacts" options={{ headerShown: true, title: 'Emergency Contacts' }} />
        <Stack.Screen name="crash-alert" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="active-sos" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="sos-received" options={{ headerShown: true, title: 'SOS Received' }} />
        <Stack.Screen name="ride-summary" options={{ headerShown: true, title: 'Ride Summary' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
