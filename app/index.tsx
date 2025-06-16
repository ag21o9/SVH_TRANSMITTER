import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import DeviceConfigPage from "./config";

const Stack = createNativeStackNavigator();

export default function Index() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="DeviceConfig"
        component={DeviceConfigPage}
        options={{
          title: "Device Configuration",
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}
