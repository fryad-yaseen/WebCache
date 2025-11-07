import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider as RestyleProvider } from '@shopify/restyle';
import { darkTheme, lightTheme } from '@/theme/restyle';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RestyleProvider theme={colorScheme === 'dark' ? darkTheme : lightTheme}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ gestureEnabled: true, fullScreenGestureEnabled: true }}>
            <Stack.Screen name="index" options={{ title: 'Saved Pages' }} />
            <Stack.Screen name="browser" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </RestyleProvider>
    </GestureHandlerRootView>
  );
}
