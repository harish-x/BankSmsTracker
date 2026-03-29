/**
 * Transaction detail screen
 * Shows full details of a single transaction from the API.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS } from '@/constants/categories';
import { fetchTransactionDetail, ApiTransactionDetail, updateMerchantCategory } from '@/services/transactionService';

const CATEGORIES = [
  { name: 'Food', icon: '🍔' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Shopping', icon: '🛍️' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'OTT and Entertainment', icon: '📺' },
  { name: 'Highway Toll', icon: '🛣️' },
  { name: 'Snacks & Groceries', icon: '🥡' },
  { name: 'Internet and Phone Bills', icon: '📡' },
  { name: 'Fuel', icon: '⛽' },
  { name: 'Alcohol', icon: '🍺' },
  { name: 'Income', icon: '💰' },
  { name: 'Other', icon: '📦' },
];

function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function DetailRow({ label, value, icon, onPress }: { label: string; value: string; icon?: string; onPress?: () => void }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? DARK : LIGHT;

  const content = (
    <View style={[styles.detailRow, { borderBottomColor: c.border }]}>
      <View style={styles.detailLabel}>
        {icon && <Text style={{ fontSize: 16, marginRight: 8 }}>{icon}</Text>}
        <Text style={[styles.labelText, { color: c.sub }]}>{label}</Text>
      </View>
      <View style={styles.detailValue}>
        <Text style={[styles.valueText, { color: onPress ? '#3B82F6' : c.text }]}>{value}</Text>
        {onPress && <Text style={{ color: '#3B82F6', fontSize: 12 }}>  Edit</Text>}
      </View>
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  }
  return content;
}

function CategorySelectorModal({
  visible,
  onClose,
  currentCategory,
  onSelect,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  currentCategory: string;
  onSelect: (category: string) => void;
  isDark: boolean;
}) {
  const c = isDark ? DARK : LIGHT;
  const [customCategory, setCustomCategory] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1} />
      <View style={[styles.modalContent, { backgroundColor: c.card }]}>
        <Text style={[styles.modalTitle, { color: c.text }]}>Select Category</Text>
        
        {!showCustom ? (
          <>
            <FlatList
              data={CATEGORIES}
              keyExtractor={(item) => item.name}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => {
                const isSelected = item.name.toLowerCase() === currentCategory.toLowerCase();
                return (
                  <TouchableOpacity
                    style={[
                      styles.categoryItem,
                      { backgroundColor: isSelected ? '#3B82F6' : c.bg },
                    ]}
                    onPress={() => onSelect(item.name)}
                  >
                    <Text style={{ fontSize: 18, marginRight: 12 }}>{item.icon}</Text>
                    <Text
                      style={[
                        styles.categoryItemText,
                        { color: isSelected ? '#fff' : c.text },
                      ]}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={[styles.customButton, { borderColor: c.border }]}
              onPress={() => setShowCustom(true)}
            >
              <Text style={[styles.customButtonText, { color: c.sub }]}>+ Add Custom Category</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View>
            <TextInput
              style={[
                styles.customInput,
                { backgroundColor: c.bg, color: c.text, borderColor: c.border },
              ]}
              placeholder="Enter category name"
              placeholderTextColor={c.sub}
              value={customCategory}
              onChangeText={setCustomCategory}
              autoFocus
            />
            <View style={styles.customActions}>
              <TouchableOpacity
                style={[styles.customAction, { backgroundColor: c.bg }]}
                onPress={() => setShowCustom(false)}
              >
                <Text style={{ color: c.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.customAction, { backgroundColor: '#3B82F6' }]}
                onPress={() => {
                  if (customCategory.trim()) {
                    onSelect(customCategory.trim());
                  }
                }}
              >
                <Text style={{ color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? DARK : LIGHT;

  const [transaction, setTransaction] = useState<ApiTransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);

  useEffect(() => {
    async function loadTransaction() {
      if (!id) return;
      
      setLoading(true);
      const result = await fetchTransactionDetail(id);
      setLoading(false);
      
      if (result.error) {
        setError(result.error);
      } else {
        setTransaction(result.transaction);
      }
    }

    loadTransaction();
  }, [id]);

  const handleCategorySelect = async (categoryName: string) => {
    if (!transaction?.merchant?._id) return;

    setUpdatingCategory(true);
    const result = await updateMerchantCategory(transaction.merchant._id, categoryName);
    setUpdatingCategory(false);

    if (result.success) {
      setTransaction((prev) => prev ? {
        ...prev,
        category: {
          ...prev.category,
          name: categoryName,
        },
      } : null);
      setCategoryModalVisible(false);
      Alert.alert('Success', `Category updated! ${result.transactions_updated || 0} transaction(s) updated.`);
    } else {
      Alert.alert('Error', result.error || 'Failed to update category');
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (error || !transaction) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
        <View style={[styles.center, { padding: 20 }]}>
          <Text style={[styles.errorText, { color: '#EF4444' }]}>{error || 'Transaction not found'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const categoryName = transaction.category?.name || 'other';
  const categoryColor = CATEGORY_COLORS[categoryName.toLowerCase() as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.other;
  const categoryIcon = CATEGORY_ICONS[categoryName.toLowerCase() as keyof typeof CATEGORY_ICONS] || CATEGORY_ICONS.other;
  const categoryLabel = CATEGORY_LABELS[categoryName.toLowerCase() as keyof typeof CATEGORY_LABELS] || 'Other';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={c.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Amount Header */}
        <View style={[styles.amountCard, { backgroundColor: c.card }]}>
          <View style={[styles.iconCircle, { backgroundColor: categoryColor + '22' }]}>
            <Text style={{ fontSize: 28 }}>{categoryIcon}</Text>
          </View>
          <Text style={[styles.amount, { color: transaction.tnx_type === 'credit' ? '#10B981' : '#EF4444' }]}>
            {transaction.tnx_type === 'credit' ? '+' : '-'}{formatINR(transaction.amount)}
          </Text>
          <Text style={[styles.typeLabel, { color: transaction.tnx_type === 'credit' ? '#10B981' : '#EF4444' }]}>
            {transaction.tnx_type === 'credit' ? 'Income' : 'Expense'}
          </Text>
        </View>

        {/* Details Section */}
        <View style={[styles.section, { backgroundColor: c.card }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Transaction Details</Text>
          
          <DetailRow 
            label="Date & Time" 
            value={formatDateTime(transaction.tnx_date)} 
            icon="🕒"
          />
          <DetailRow 
            label="Merchant" 
            value={transaction.source_name || 'Unknown'} 
            icon="🏪"
          />
          {transaction.source_vpa && (
            <DetailRow 
              label="UPI/VPA" 
              value={transaction.source_vpa} 
              icon="📱"
            />
          )}
          <DetailRow 
            label="Category" 
            value={categoryLabel} 
            icon={categoryIcon}
            onPress={() => transaction.merchant?._id && setCategoryModalVisible(true)}
          />
          {transaction.account && (
            <DetailRow 
              label="Account" 
              value={`${transaction.account.bank_name} •••• ${transaction.account.account_mask}`} 
              icon="🏦"
            />
          )}
        </View>

        {/* Raw Message Section */}
        <View style={[styles.section, { backgroundColor: c.card }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Raw Message</Text>
          <Text style={[styles.rawMessage, { color: c.sub, backgroundColor: c.bg }]}>
            {transaction.raw_message || 'No raw message available'}
          </Text>
        </View>

        {/* IDs Section */}
        <View style={[styles.section, { backgroundColor: c.card }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Reference</Text>
          <DetailRow label="Transaction ID" value={transaction._id} icon="🔖" />
          {transaction.merchant?._id && (
            <DetailRow label="Merchant ID" value={transaction.merchant._id} icon="🏪" />
          )}
        </View>
      </ScrollView>

      <CategorySelectorModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        currentCategory={categoryName}
        onSelect={handleCategorySelect}
        isDark={isDark}
      />

      {updatingCategory && (
        <View style={[styles.loadingOverlay, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 8 }}>Updating...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const LIGHT = { bg: '#F8FAFC', card: '#FFFFFF', text: '#0F172A', sub: '#64748B', border: '#E2E8F0' };
const DARK  = { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', sub: '#94A3B8', border: '#334155' };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 32 },

  amountCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
  },

  section: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    padding: 16,
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  detailLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelText: {
    fontSize: 14,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '600',
  },

  rawMessage: {
    fontSize: 13,
    padding: 16,
    paddingTop: 8,
    lineHeight: 20,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },

  errorText: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  categoryItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  customButton: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 8,
  },
  customButtonText: {
    fontSize: 14,
  },
  customInput: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
  },
  customActions: {
    flexDirection: 'row',
    gap: 12,
  },
  customAction: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
});
