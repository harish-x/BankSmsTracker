/**
 * Transactions screen
 * Full searchable list of all transactions with API-based filters.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS } from '@/constants/categories';
import { useTransactions, TransactionFilters } from '@/hooks/useTransactions';
import type { Transaction } from '@/types';

function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

function getDateRange(days: number): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split('T')[0];
  let from: string;

  if (days === 0) {
    from = to;
  } else if (days === -1) {
    from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  } else if (days === -2) {
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const fromDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const toDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
    from = fromDate.toISOString().split('T')[0];
    return { from, to: toDate.toISOString().split('T')[0] };
  } else {
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - days);
    from = fromDate.toISOString().split('T')[0];
  }

  return { from, to };
}

function TransactionCard({ item, isDark, onPress }: { item: Transaction; isDark: boolean; onPress: () => void }) {
  const c = isDark ? DARK : LIGHT;

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: c.card }]} onPress={onPress} activeOpacity={0.7}>
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
      </View>
    </TouchableOpacity>
  );
}

type TransactionTypeFilter = 'all' | 'credit' | 'debit';
type SortFilter = 'asc' | 'desc';

function FilterModal({
  visible,
  onClose,
  filters,
  onApply,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  filters: TransactionFilters;
  onApply: (f: TransactionFilters) => void;
  isDark: boolean;
}) {
  const c = isDark ? DARK : LIGHT;
  const [localFilters, setLocalFilters] = useState<TransactionFilters>(filters);
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>(
    filters.tnx_type ? filters.tnx_type : 'all'
  );
  const [sortFilter, setSortFilter] = useState<SortFilter>(filters.sort || 'desc');
  const [dateFrom, setDateFrom] = useState(filters.date_from || '');
  const [dateTo, setDateTo] = useState(filters.date_to || '');

  const handleApply = () => {
    const newFilters: TransactionFilters = {
      sort: sortFilter,
      tnx_type: typeFilter === 'all' ? undefined : typeFilter,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    };
    onApply(newFilters);
    onClose();
  };

  const handleClear = () => {
    setTypeFilter('all');
    setSortFilter('desc');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.modalContent, { backgroundColor: c.card }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: c.text }]}>Filters</Text>

          <Text style={[styles.filterLabel, { color: c.sub }]}>Transaction Type</Text>
          <View style={styles.filterRow}>
            {(['all', 'credit', 'debit'] as TransactionTypeFilter[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.filterOption,
                  { backgroundColor: typeFilter === t ? '#3B82F6' : c.bg },
                ]}
                onPress={() => setTypeFilter(t)}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    { color: typeFilter === t ? '#fff' : c.text },
                  ]}
                >
                  {t === 'all' ? 'All' : t === 'credit' ? 'Income' : 'Expense'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.filterLabel, { color: c.sub }]}>Sort By Date</Text>
          <View style={styles.filterRow}>
            {(['desc', 'asc'] as SortFilter[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.filterOption,
                  { backgroundColor: sortFilter === s ? '#3B82F6' : c.bg },
                ]}
                onPress={() => setSortFilter(s)}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    { color: sortFilter === s ? '#fff' : c.text },
                  ]}
                >
                  {s === 'desc' ? 'Newest First' : 'Oldest First'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.filterLabel, { color: c.sub }]}>Date Range</Text>
          <View style={styles.dateRangeGrid}>
            {[
              { label: 'Today', days: 0 },
              { label: 'Yesterday', days: 1 },
              { label: 'Last 7 days', days: 7 },
              { label: 'Last 30 days', days: 30 },
              { label: 'This Month', days: -1 },
              { label: 'Last Month', days: -2 },
            ].map((range) => {
              const isSelected = dateFrom === getDateRange(range.days).from && dateTo === getDateRange(range.days).to;
              return (
                <TouchableOpacity
                  key={range.label}
                  style={[
                    styles.dateRangeOption,
                    { backgroundColor: isSelected ? '#3B82F6' : c.bg },
                  ]}
                  onPress={() => {
                    const rangeDates = getDateRange(range.days);
                    setDateFrom(rangeDates.from);
                    setDateTo(rangeDates.to);
                  }}
                >
                  <Text
                    style={[
                      styles.dateRangeText,
                      { color: isSelected ? '#fff' : c.text },
                    ]}
                  >
                    {range.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.customDateButton, { borderColor: c.border }]}
            onPress={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            <Text style={[styles.customDateText, { color: c.sub }]}>Custom Range</Text>
          </TouchableOpacity>
          {(dateFrom || dateTo) && (
            <View style={styles.customDateInputs}>
              <View style={styles.customDateField}>
                <Text style={[styles.customDateLabel, { color: c.sub }]}>From</Text>
                <Text style={[styles.customDateValue, { color: c.text }]}>{dateFrom || 'Not set'}</Text>
              </View>
              <View style={styles.customDateField}>
                <Text style={[styles.customDateLabel, { color: c.sub }]}>To</Text>
                <Text style={[styles.customDateValue, { color: c.text }]}>{dateTo || 'Not set'}</Text>
              </View>
            </View>
          )}

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: c.bg }]}
              onPress={handleClear}
            >
              <Text style={[styles.modalButtonText, { color: c.text }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: '#3B82F6' }]}
              onPress={handleApply}
            >
              <Text style={[styles.modalButtonText, { color: '#fff' }]}>Apply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function TransactionsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c      = isDark ? DARK : LIGHT;

  const {
    transactions,
    loading,
    reload,
    loadMore,
    hasMore,
    isLoadingMore,
    error,
    pagination,
    filters,
    setFilters,
  } = useTransactions();

  const [refreshing, setRefreshing] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const handleApplyFilters = useCallback((newFilters: TransactionFilters) => {
    setFilters(newFilters);
  }, [setFilters]);

  const hasActiveFilters = filters.tnx_type || filters.date_from || filters.date_to;

  if (loading && transactions.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
        <View style={[styles.center, { padding: 20 }]}>
          <Text style={[styles.errorText, { color: '#EF4444' }]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={reload}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: c.text }]}>Transactions</Text>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: hasActiveFilters ? '#3B82F6' : 'transparent' }]}
          onPress={() => setFilterModalVisible(true)}
        >
          <MaterialCommunityIcons 
            name="sort" 
            size={22} 
            color={hasActiveFilters ? '#fff' : (isDark ? '#F1F5F9' : '#0F172A')} 
          />
        </TouchableOpacity>
      </View>

      {pagination && (
        <Text style={[styles.countText, { color: c.sub }]}>
          {pagination.total} total · Page {pagination.page}/{pagination.total_pages}
        </Text>
      )}

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.refNumber || `${item.merchant}-${item.date}-${item.amount}`}
        renderItem={({ item }) => {
            const txId = item.refNumber;
            return (
              <TransactionCard 
                item={item} 
                isDark={isDark} 
                onPress={() => txId ? router.push({ pathname: '/transaction/[id]', params: { id: txId } } as any) : undefined}
              />
            );
          }}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color="#3B82F6" />
            </View>
          ) : hasMore ? (
            <Text style={[styles.emptyText, { paddingTop: 16, fontSize: 12 }]}>
              Pull up to load more
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: c.sub }]}>
            No transactions found.
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApply={handleApplyFilters}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

const LIGHT = { bg: '#F8FAFC', card: '#FFFFFF', text: '#0F172A', sub: '#64748B', border: '#E2E8F0' };
const DARK  = { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', sub: '#94A3B8', border: '#334155' };

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    gap: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  filterButton: { padding: 8, borderRadius: 8 },

  countText: { fontSize: 12, paddingHorizontal: 14, paddingBottom: 4, fontWeight: '500' },
  listContent: { padding: 12, paddingBottom: 32 },
  emptyText: { textAlign: 'center', paddingTop: 48, fontSize: 14, lineHeight: 22 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
  },
  iconBox: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, gap: 2 },
  merchant: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 11 },
  ref: { fontSize: 10 },

  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 15, fontWeight: '700' },

  errorText: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  loadingMore: { paddingVertical: 16, alignItems: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  filterLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterOption: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  filterOptionText: { fontSize: 14, fontWeight: '500' },
  dateInput: { padding: 12, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  dateRangeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateRangeOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  dateRangeText: { fontSize: 13, fontWeight: '500' },
  customDateButton: { padding: 12, borderRadius: 8, borderWidth: 1, marginTop: 12, alignItems: 'center' },
  customDateText: { fontSize: 14, fontWeight: '500' },
  customDateInputs: { flexDirection: 'row', gap: 12, marginTop: 12 },
  customDateField: { flex: 1, alignItems: 'center' },
  customDateLabel: { fontSize: 12, marginBottom: 4 },
  customDateValue: { fontSize: 14, fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalButton: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600' },
});
