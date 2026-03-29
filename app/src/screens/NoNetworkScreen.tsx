import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, useColorScheme, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NoNetworkScreen() {
  const isDark = useColorScheme() === 'dark';
  const bg   = isDark ? '#0F172A' : '#F8FAFC';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub  = isDark ? '#94A3B8' : '#64748B';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <MaterialCommunityIcons name="wifi-off" size={72} color="#94A3B8" />
        <Text style={[styles.title, { color: text }]}>No Internet Connection</Text>
        <Text style={[styles.sub, { color: sub }]}>
          Please check your connection.{'\n'}The app will resume automatically when you're back online.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  title:  { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
