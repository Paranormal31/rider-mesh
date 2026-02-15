import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
