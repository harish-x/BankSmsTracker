/**
 * Dashboard screen (index.tsx)
 * Shows: sync button, spending breakdown list.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, PieChart } from 'react-native-gifted-charts';

import { CATEGORY_LABELS, getCategoryColor } from '@/constants/categories';
import { getAccounts } from '@/services/accountService';
import { syncTransactions } from '@/services/syncService';
import { fetchCategoryBreakdown, fetchStatistics, fetchSpendingTrend, CategoryBreakdownResponse, StatisticsResponse, SpendingTrendResponse } from '@/services/transactionService';
import { useTransactions } from '@/hooks/useTransactions';
import { useAuth } from '@/contexts/AuthContext';

interface Account {
  id: string;
  bank_name: string;
  account_mask: string;
}

interface FilterState {
  date_from: string | null;
  date_to: string | null;
  tnx_type: 'debit' | 'credit';
  account_id: string | null;
}

const DATE_PRESETS = [
  { label: 'Today', getValue: () => {
    const today = new Date();
    return { date_from: today.toISOString().split('T')[0], date_to: today.toISOString().split('T')[0] };
  }},
  { label: 'Yesterday', getValue: () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.toISOString().split('T')[0];
    return { date_from: y, date_to: y };
  }},
  { label: 'Last 7 days', getValue: () => {
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { date_from: weekAgo.toISOString().split('T')[0], date_to: today.toISOString().split('T')[0] };
  }},
  { label: 'Last 30 days', getValue: () => {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    return { date_from: monthAgo.toISOString().split('T')[0], date_to: today.toISOString().split('T')[0] };
  }},
  { label: 'This Month', getValue: () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return { date_from: firstDay.toISOString().split('T')[0], date_to: today.toISOString().split('T')[0] };
  }},
  { label: 'Last Month', getValue: () => {
    const today = new Date();
    const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthLastDay = new Date(firstDayThisMonth);
    lastMonthLastDay.setDate(lastMonthLastDay.getDate() - 1);
    const firstDayLastMonth = new Date(firstDayThisMonth);
    firstDayLastMonth.setDate(1);
    return { date_from: firstDayLastMonth.toISOString().split('T')[0], date_to: lastMonthLastDay.toISOString().split('T')[0] };
  }},
];

function formatINR(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

export default function DashboardScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c      = isDark ? DARK : LIGHT;

  const { signOut } = useAuth();
  const { loading, reload } = useTransactions();
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [categoryData, setCategoryData] = useState<CategoryBreakdownResponse | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [statisticsData, setStatisticsData] = useState<StatisticsResponse | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [trendData, setTrendData] = useState<SpendingTrendResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendPeriod, setTrendPeriod] = useState<'7d' | '15d' | 'month'>('month');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    date_from: null,
    date_to: null,
    tnx_type: 'debit',
    account_id: null,
  });


  const loadAccounts = useCallback(async () => {
    const result = await getAccounts();
    if (result.accounts) {
      setAccounts(result.accounts);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const loadCategoryBreakdown = useCallback(async () => {
    setCategoryLoading(true);
    const result = await fetchCategoryBreakdown({
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      tnx_type: filters.tnx_type,
      account_id: filters.account_id || undefined,
    });
    setCategoryLoading(false);
    if (result.data) {
      setCategoryData(result.data);
    }
  }, [filters]);

  const loadStatistics = useCallback(async () => {
    setStatisticsLoading(true);
    const result = await fetchStatistics({
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      account_id: filters.account_id || undefined,
    });
    setStatisticsLoading(false);
    if (result.data) {
      setStatisticsData(result.data);
    }
  }, [filters]);

  const loadSpendingTrend = useCallback(async () => {
    setTrendLoading(true);
    const result = await fetchSpendingTrend({
      period: trendPeriod,
      account_id: filters.account_id || undefined,
      tnx_type: filters.tnx_type,
    });
    setTrendLoading(false);
    if (result.data) {
      setTrendData(result.data);
    }
  }, [trendPeriod, filters.account_id, filters.tnx_type]);

  useEffect(() => {
    loadCategoryBreakdown();
    loadStatistics();
    loadSpendingTrend();
  }, [loadCategoryBreakdown, loadStatistics, loadSpendingTrend]);

  const applyPreset = (preset: typeof DATE_PRESETS[number]) => {
    const { date_from, date_to } = preset.getValue();
    setFilters(prev => ({ ...prev, date_from, date_to }));
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    setFilters({ date_from: null, date_to: null, tnx_type: 'debit', account_id: null });
    setFilterModalVisible(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        reload(),
        loadCategoryBreakdown(),
        loadStatistics(),
        loadSpendingTrend(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [reload, loadCategoryBreakdown, loadStatistics, loadSpendingTrend]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg('');
    const result = await syncTransactions();
    setSyncing(false);
    if (result.authExpired) {
      setSyncMsg('Session expired. Please sign in again.');
      signOut();
      return;
    }
    setSyncMsg(
      result.error
        ? `Sync failed: ${result.error}`
        : `✓ Synced ${result.synced} transaction${result.synced !== 1 ? 's' : ''}`
    );
    setTimeout(() => setSyncMsg(''), 4000);
  }, [signOut]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {/* Sync + filter row */}
        <View style={styles.syncRow}>
          {syncMsg ? (
            <Text style={[styles.syncMsg, { color: syncMsg.startsWith('✓') ? '#10B981' : '#EF4444' }]}>
              {syncMsg}
            </Text>
          ) : null}
          <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.filterIconBtn}>
            <MaterialCommunityIcons name="filter-variant" size={20} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={syncing}>
            {syncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialCommunityIcons name="cloud-sync" size={18} color="#fff" />}
            <Text style={styles.syncBtnText}>{syncing ? 'Syncing…' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </View>

        {/* Statistics Card */}
        {statisticsLoading ? (
          <View style={[styles.card, { backgroundColor: c.card, height: 140 }]}>
            <ActivityIndicator size="small" color="#3B82F6" />
          </View>
        ) : statisticsData ? (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Overview</Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="arrow-down-circle" size={24} color="#EF4444" />
                <Text style={[styles.statLabel, { color: c.subText }]}>Spent</Text>
                <Text style={[styles.statValue, { color: '#EF4444' }]}>{formatINR(statisticsData.range.spent.amount)}</Text>
                <Text style={[styles.statCount, { color: c.subText }]}>{statisticsData.range.spent.count} txns</Text>
              </View>
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="arrow-up-circle" size={24} color="#10B981" />
                <Text style={[styles.statLabel, { color: c.subText }]}>Income</Text>
                <Text style={[styles.statValue, { color: '#10B981' }]}>{formatINR(statisticsData.range.gained.amount)}</Text>
                <Text style={[styles.statCount, { color: c.subText }]}>{statisticsData.range.gained.count} txns</Text>
              </View>
              <View style={styles.statItem}>
                <MaterialCommunityIcons 
                  name={statisticsData.range.net >= 0 ? 'trending-up' : 'trending-down'} 
                  size={24} 
                  color={statisticsData.range.net >= 0 ? '#10B981' : '#EF4444'} 
                />
                <Text style={[styles.statLabel, { color: c.subText }]}>Net</Text>
                <Text style={[styles.statValue, { color: statisticsData.range.net >= 0 ? '#10B981' : '#EF4444' }]}>
                  {statisticsData.range.net >= 0 ? '+' : ''}{formatINR(statisticsData.range.net)}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.emptyText, { color: c.subText }]}>No statistics available</Text>
          </View>
        )}

        {/* Spending Trend Line Chart */}
        {trendLoading ? (
          <View style={[styles.card, { backgroundColor: c.card, height: 200 }]}>
            <ActivityIndicator size="small" color="#3B82F6" />
          </View>
        ) : trendData && trendData.days.length > 0 ? (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              {filters.tnx_type === 'credit' ? 'Income' : 'Spending'} Trend
            </Text>

            <View style={styles.trendPeriodRow}>
              {(['7d', '15d', 'month'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.trendPeriodChip,
                    { backgroundColor: c.border },
                    trendPeriod === p && { backgroundColor: '#3B82F6' },
                  ]}
                  onPress={() => setTrendPeriod(p)}
                >
                  <Text
                    style={[
                      styles.trendPeriodText,
                      { color: c.text },
                      trendPeriod === p && { color: '#fff' },
                    ]}
                  >
                    {p === '7d' ? '7 Days' : p === '15d' ? '15 Days' : 'Month'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.chartContainer}>
              {(() => {
                const amounts = trendData.days.map((d) => d.amount);
                const rawMin = Math.min(...amounts);
                const rawMax = Math.max(...amounts);
                const range = rawMax - rawMin;

                // Smart y-axis: add 10% padding, snap to nice round numbers
                const niceStep = (r: number) => {
                  if (r === 0) return rawMax > 0 ? rawMax * 0.2 || 100 : 100;
                  const mag = Math.pow(10, Math.floor(Math.log10(r)));
                  const norm = r / mag;
                  if (norm <= 1.5) return mag * 0.5;
                  if (norm <= 3) return mag;
                  if (norm <= 7) return mag * 2;
                  return mag * 5;
                };
                const step = niceStep(range);
                const yMin = Math.max(0, Math.floor(rawMin / step) * step - step);
                const yMax = Math.ceil(rawMax / step) * step + step;
                const noOfSections = Math.min(5, Math.max(3, Math.round((yMax - yMin) / step)));

                // Smart x-axis: show every Nth label so they don't overlap
                const dayCount = trendData.days.length;
                const labelInterval = dayCount > 20 ? 5 : dayCount > 10 ? 3 : dayCount > 7 ? 2 : 1;

                const chartData = trendData.days.map((day, i) => ({
                  value: day.amount,
                  label: i % labelInterval === 0 ? day.date.slice(5).replace('-', '/') : '',
                }));

                return (
                  <LineChart
                    data={chartData}
                    width={260}
                    height={160}
                    spacing={dayCount > 15 ? 28 : dayCount > 7 ? 36 : 44}
                    color="#3B82F6"
                    thickness={2}
                    dataPointsColor="#3B82F6"
                    dataPointsRadius={3}
                    startFillColor="rgba(59,130,246,0.2)"
                    endFillColor="rgba(59,130,246,0.01)"
                    areaChart
                    curved
                    yAxisOffset={yMin}
                    maxValue={yMax - yMin}
                    noOfSections={noOfSections}
                    formatYLabel={(val: string) => formatINR(Number(val) + yMin)}
                    yAxisTextStyle={{ color: c.subText, fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: c.subText, fontSize: 9 }}
                    rulesColor={c.border}
                    rulesType="dashed"
                    yAxisColor="transparent"
                    xAxisColor={c.border}
                    pointerConfig={{
                      pointerStripColor: c.border,
                      pointerColor: '#3B82F6',
                      pointerLabelComponent: (items: { value: number }[]) => (
                        <View style={styles.tooltipContainer}>
                          <Text style={styles.tooltipText}>{formatINR(items[0]?.value ?? 0)}</Text>
                        </View>
                      ),
                    }}
                  />
                );
              })()}
            </View>

            <View style={styles.trendSummaryRow}>
              <Text style={[styles.trendSummaryLabel, { color: c.subText }]}>
                Total: <Text style={[styles.trendSummaryValue, { color: c.text }]}>{formatINR(trendData.total)}</Text>
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              {filters.tnx_type === 'credit' ? 'Income' : 'Spending'} Trend
            </Text>
            <Text style={[styles.emptyText, { color: c.subText }]}>No trend data available</Text>
          </View>
        )}

        {/* Spending by Category */}
        {categoryLoading ? (
          <View style={[styles.card, { backgroundColor: c.card, height: 200 }]}>
            <ActivityIndicator size="small" color="#3B82F6" />
          </View>
        ) : categoryData && categoryData.categories.length > 0 ? (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              {filters.tnx_type === 'credit' ? 'Income' : 'Spending'} by Category
            </Text>
            
            <View style={styles.chartContainer}>
              <PieChart
                data={categoryData.categories.map((cat) => {
                  const normalizedName = cat.category_name?.toLowerCase() || 'other';
                  return {
                    value: cat.amount,
                    color: getCategoryColor(normalizedName),
                    text: `${cat.percentage.toFixed(0)}%`,
                    textColor: '#fff',
                    textSize: 11,
                  };
                })}
                donut
                radius={80}
                innerRadius={50}
                innerCircleColor={c.card}
                showText
                labelsPosition="mid"
                centerLabelComponent={() => (
                  <View style={styles.centerLabel}>
                    <Text style={[styles.centerLabelAmount, { color: c.text }]}>{formatINR(categoryData.total)}</Text>
                    <Text style={[styles.centerLabelText, { color: c.subText }]}>Total</Text>
                  </View>
                )}
              />
            </View>
            
            <View style={styles.categoryList}>
              {categoryData.categories.map((cat) => {
                const normalizedName = cat.category_name?.toLowerCase() || 'other';
                const color = getCategoryColor(normalizedName);
                return (
                  <View key={cat.category_name} style={[styles.categoryItem, { borderBottomColor: c.border }]}>
                    <View style={styles.categoryLeft}>
                      <View style={[styles.categoryDot, { backgroundColor: color }]} />
                      <View style={styles.categoryInfo}>
                        <Text style={[styles.categoryName, { color: c.text }]}>
                          {CATEGORY_LABELS[normalizedName as keyof typeof CATEGORY_LABELS] || cat.category_name}
                        </Text>
                        <Text style={[styles.categoryCount, { color: c.subText }]}>
                          {cat.count} transaction{cat.count !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.categoryRight}>
                      <Text style={[styles.categoryAmount, { color: c.text }]}>{formatINR(cat.amount)}</Text>
                      <Text style={[styles.categoryPercent, { color: c.subText }]}>{cat.percentage.toFixed(1)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>
              {filters.tnx_type === 'credit' ? 'Income' : 'Spending'} by Category
            </Text>
            <Text style={[styles.emptyText, { color: c.subText }]}>No data available</Text>
          </View>
        )}

        <Modal
          visible={filterModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setFilterModalVisible(false)}>
            <View style={[styles.modalContent, { backgroundColor: c.card }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Filter</Text>
              
              <Text style={[styles.filterLabel, { color: c.subText }]}>Date Range</Text>
              <View style={styles.presetGrid}>
                {DATE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    style={[
                      styles.presetChip,
                      { backgroundColor: c.border },
                      filters.date_from === preset.getValue().date_from && filters.date_to === preset.getValue().date_to && { backgroundColor: '#3B82F6' },
                    ]}
                    onPress={() => applyPreset(preset)}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        { color: c.text },
                        filters.date_from === preset.getValue().date_from && filters.date_to === preset.getValue().date_to && { color: '#fff' },
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.filterLabel, { color: c.subText }]}>Type</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeChip, filters.tnx_type === 'debit' && { backgroundColor: '#3B82F6' }, { borderColor: c.border }]}
                  onPress={() => setFilters(prev => ({ ...prev, tnx_type: 'debit' }))}
                >
                  <Text style={[styles.typeChipText, { color: c.text }, filters.tnx_type === 'debit' && { color: '#fff' }]}>Spending (Debit)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeChip, filters.tnx_type === 'credit' && { backgroundColor: '#10B981' }, { borderColor: c.border }]}
                  onPress={() => setFilters(prev => ({ ...prev, tnx_type: 'credit' }))}
                >
                  <Text style={[styles.typeChipText, { color: c.text }, filters.tnx_type === 'credit' && { color: '#fff' }]}>Income (Credit)</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.filterLabel, { color: c.subText }]}>Account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountScroll}>
                <TouchableOpacity
                  style={[styles.accountChip, { backgroundColor: c.border }, !filters.account_id && { backgroundColor: '#3B82F6' }]}
                  onPress={() => setFilters(prev => ({ ...prev, account_id: null }))}
                >
                  <Text style={[styles.accountChipText, { color: c.text }, !filters.account_id && { color: '#fff' }]}>All Accounts</Text>
                </TouchableOpacity>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.accountChip, { backgroundColor: c.border }, filters.account_id === acc.id && { backgroundColor: '#3B82F6' }]}
                    onPress={() => setFilters(prev => ({ ...prev, account_id: acc.id }))}
                  >
                    <Text style={[styles.accountChipText, { color: c.text }, filters.account_id === acc.id && { color: '#fff' }]}>
                      {acc.bank_name} ****{acc.account_mask}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={[styles.clearText, { color: '#EF4444' }]}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterModalVisible(false)}>
                  <Text style={styles.applyBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const LIGHT = { bg: '#F8FAFC', card: '#FFFFFF', text: '#0F172A', subText: '#64748B', border: '#E2E8F0' };
const DARK  = { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', subText: '#94A3B8', border: '#334155' };

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, gap: 16, paddingBottom: 32 },

  syncRow:      { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  filterIconBtn:{ padding: 6, borderRadius: 20, backgroundColor: 'rgba(59,130,246,0.1)' },
  syncBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  syncBtnText:  { color: '#fff', fontSize: 13, fontWeight: '600' },
  syncMsg:      { fontSize: 12, fontWeight: '500', flex: 1 },

  card:      { borderRadius: 16, padding: 16, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },

  chartContainer: { alignItems: 'center', marginVertical: 12 },
  centerLabel: { alignItems: 'center' },
  centerLabelAmount: { fontSize: 16, fontWeight: '700' },
  centerLabelText: { fontSize: 11 },

  categoryList: { gap: 0 },
  categoryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  categoryDot: { width: 12, height: 12, borderRadius: 6 },
  categoryInfo: { marginLeft: 10 },
  categoryName: { fontSize: 14, fontWeight: '600' },
  categoryCount: { fontSize: 12 },
  categoryRight: { alignItems: 'flex-end' },
  categoryAmount: { fontSize: 14, fontWeight: '700' },
  categoryPercent: { fontSize: 11 },

  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 16, fontWeight: '700' },
  statCount: { fontSize: 11 },

  amountValue: { fontSize: 14, fontWeight: '700' },
  percentage: { fontSize: 11 },

  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { borderRadius: 16, padding: 20, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  filterLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  presetChipText: { fontSize: 13 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeChip: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  typeChipText: { fontSize: 13, fontWeight: '500' },
  accountScroll: { flexDirection: 'row', marginTop: 4 },
  accountChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  accountChipText: { fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
  clearText: { fontSize: 14, fontWeight: '600' },
  applyBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  applyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  trendPeriodRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  trendPeriodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  trendPeriodText: { fontSize: 12, fontWeight: '600' },
  trendSummaryRow: { alignItems: 'center', marginTop: 4 },
  trendSummaryLabel: { fontSize: 12 },
  trendSummaryValue: { fontWeight: '700', fontSize: 13 },
  tooltipContainer: { backgroundColor: '#1E293B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tooltipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
