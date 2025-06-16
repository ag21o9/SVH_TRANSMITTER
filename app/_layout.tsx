import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Hide header for all screens
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="config" />
    </Stack>
  );
}
