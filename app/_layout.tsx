import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
