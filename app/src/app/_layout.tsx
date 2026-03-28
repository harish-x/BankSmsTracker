/**
 * _layout.tsx
 * Root layout — sets up:
 *   • AuthProvider (token-based auth state)
 *   • Shows LoginScreen when unauthenticated, Tabs when authenticated
 *   • React Navigation theme (light / dark)
 *   • 3 bottom tabs: Dashboard, Transactions, Settings
 *   • Automatic SMS scan + server sync (foreground + background)
 *
 * Automatic sync strategy (zero user interaction needed):
 *   1. Immediately on login / app open
 *   2. Every time the app comes back to the foreground (AppState → "active")
 *   3. Every FOREGROUND_INTERVAL_MS while the app stays open
 *   4. Every ~15 min via Android WorkManager even when the app is closed
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, useColorScheme, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LoginScreen from '@/screens/LoginScreen';
import { checkAndSaveSms } from '@/services/smsService';
import { syncTransactions } from '@/services/syncService';
import { registerBackgroundSync } from '@/tasks/backgroundSync';

// How often to auto-sync while the app is in the foreground (5 minutes)
const FOREGROUND_INTERVAL_MS = 5 * 60 * 1000;

// ─── Inner layout (needs AuthProvider already mounted) ────────────────────────

function AppLayout() {
  const colorScheme = useColorScheme();
  const isDark      = colorScheme === 'dark';
  const insets      = useSafeAreaInsets();
  const { isAuthenticated, isLoading, signIn, signOut } = useAuth();

  // Guard: prevents launching concurrent sync runs
  const isSyncing = useRef(false);

  /**
   * Reads any new bank SMS then sends them to the server.
   * Safe to call from anywhere — skips if a run is already in progress.
   */
  const runAutoSync = useCallback(async () => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    try {
      await checkAndSaveSms();
      const result = await syncTransactions();
      if (result.authExpired) {
        signOut();
        return;
      }
    } finally {
      isSyncing.current = false;
    }
  }, [signOut]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Register the Android WorkManager background job (15-min interval)
    registerBackgroundSync();

    // 2. Run immediately on login / app open
    runAutoSync();

    // 3. Run every time the app comes back to the foreground
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') runAutoSync();
    });

    // 4. Run on a timer while the app stays in the foreground
    const foregroundTimer = setInterval(runAutoSync, FOREGROUND_INTERVAL_MS);

    return () => {
      appStateSub.remove();
      clearInterval(foregroundTimer);
    };
  }, [isAuthenticated, runAutoSync]);

  // ── Loading splash while SecureStore is being read ────────────────────────

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  // ── Not authenticated — show login / register screen ──────────────────────

  if (!isAuthenticated) {
    return <LoginScreen onLogin={signIn} />;
  }

  // ── Authenticated — show tab navigator ────────────────────────────────────

  const tabBarStyle = {
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderTopColor:  isDark ? '#1E293B' : '#E2E8F0',
    height: 64 + insets.bottom,
    paddingBottom: 8 + insets.bottom,
  };

  const activeColor   = '#3B82F6';
  const inactiveColor = isDark ? '#64748B' : '#94A3B8';

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Tabs
        screenOptions={{
          tabBarStyle,
          tabBarActiveTintColor:   activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
          headerStyle:      { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' },
          headerTitleStyle: { color: isDark ? '#F1F5F9' : '#0F172A', fontWeight: '700', fontSize: 18 },
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Transactions',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="format-list-bulleted" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="cog" color={color} size={size} />
            ),
          }}
        />
        {/* Hide old explore tab */}
        <Tabs.Screen name="explore" options={{ href: null }} />
      </Tabs>
    </ThemeProvider>
  );
}

// ─── Root export (provides AuthProvider) ─────────────────────────────────────

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  );
}
