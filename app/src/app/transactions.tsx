/**
 * Transactions screen
 * Full searchable list of all transactions with filter by type.
 */

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS } from '@/constants/categories';
import { useTransactions } from '@/hooks/useTransactions';
import { checkAndSaveSms } from '@/services/smsService';
import { syncTransactions } from '@/services/syncService';
import type { Transaction } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

// ─── Transaction card ─────────────────────────────────────────────────────────

function TransactionCard({ item, isDark }: { item: Transaction; isDark: boolean }) {
  const c = isDark ? DARK : LIGHT;

  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={[styles.iconBox, { backgroundColor: CATEGORY_COLORS[item.category] + '22' }]}>
        <Text style={{ fontSize: 22 }}>{CATEGORY_ICONS[item.category]}</Text>
      </View>

      <View style={styles.info}>
        <Text style={[styles.merchant, { color: c.text }]} numberOfLines={1}>
          {item.merchant}
        </Text>
        <Text style={[styles.meta, { color: c.sub }]}>
          {formatDate(item.date)} · {item.bank} · {CATEGORY_LABELS[item.category]}
        </Text>
        {item.refNumber ? (
          <Text style={[styles.ref, { color: c.sub }]} numberOfLines={1}>
            Ref: {item.refNumber}
          </Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <Text style={[styles.amount, { color: item.type === 'credit' ? '#10B981' : '#EF4444' }]}>
          {item.type === 'credit' ? '+' : '-'}{formatINR(item.amount)}
        </Text>
        {item.synced === 0 && (
          <View style={styles.unsyncedBadge}>
            <Text style={styles.unsyncedText}>pending</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

type Filter = 'all' | 'credit' | 'debit' | 'fee';

function FilterPill({
  label, active, onPress, isDark,
}: { label: string; active: boolean; onPress: () => void; isDark: boolean }) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        { backgroundColor: active ? '#3B82F6' : (isDark ? '#1E293B' : '#E2E8F0') },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, { color: active ? '#fff' : (isDark ? '#94A3B8' : '#64748B') }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TransactionsScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c      = isDark ? DARK : LIGHT;

  const { transactions, loading, reload } = useTransactions();
  const [search, setSearch]               = useState('');
  const [filter, setFilter]               = useState<Filter>('all');
  const [refreshing, setRefreshing]       = useState(false);

  // Reload data each time the screen comes into focus (picks up background syncs)
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await checkAndSaveSms();
      await syncTransactions();
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchType =
        filter === 'all' ||
        (filter === 'debit' ? t.type !== 'credit' : t.type === filter);
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        t.merchant.toLowerCase().includes(q) ||
        (t.refNumber?.includes(q) ?? false) ||
        t.category.includes(q);
      return matchType && matchSearch;
    });
  }, [transactions, filter, search]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['bottom']}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={{ color: c.sub, marginRight: 6 }}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search merchant, category…"
          placeholderTextColor={c.sub}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ color: c.sub, fontSize: 18, lineHeight: 22 }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter pills */}
      <View style={styles.pillRow}>
        {(['all', 'credit', 'debit', 'fee'] as Filter[]).map((f) => (
          <FilterPill
            key={f}
            label={f === 'all' ? 'All' : f === 'credit' ? 'Income' : f === 'debit' ? 'Expense' : 'Fee'}
            active={filter === f}
            onPress={() => setFilter(f)}
            isDark={isDark}
          />
        ))}
      </View>

      {/* Count */}
      <Text style={[styles.countText, { color: c.sub }]}>
        {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
      </Text>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <TransactionCard item={item} isDark={isDark} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: c.sub }]}>
            {search ? 'No results found.' : 'No transactions yet.\nPull down to scan SMS.'}
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </SafeAreaView>
  );
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const LIGHT = { bg: '#F8FAFC', card: '#FFFFFF', text: '#0F172A', sub: '#64748B', border: '#E2E8F0' };
const DARK  = { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', sub: '#94A3B8', border: '#334155' };

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, padding: 10, borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14 },

  pillRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 4 },
  pill:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  pillText: { fontSize: 13, fontWeight: '600' },

  countText:   { fontSize: 12, paddingHorizontal: 14, paddingBottom: 4, fontWeight: '500' },
  listContent: { padding: 12, paddingBottom: 32 },
  emptyText:   { textAlign: 'center', paddingTop: 48, fontSize: 14, lineHeight: 22 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
  },
  iconBox:  { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  info:     { flex: 1, gap: 2 },
  merchant: { fontSize: 14, fontWeight: '600' },
  meta:     { fontSize: 11 },
  ref:      { fontSize: 10 },

  right:  { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 15, fontWeight: '700' },

  unsyncedBadge: { backgroundColor: '#F59E0B22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  unsyncedText:  { fontSize: 10, color: '#F59E0B', fontWeight: '600' },
});
