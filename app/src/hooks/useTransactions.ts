/**
 * useTransactions.ts
 * Central data hook — loads transactions from API and computes summary numbers.
 * Call reload() after any write to refresh the UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchTransactions, PaginationInfo } from '@/services/transactionService';
import { Category } from '@/types';
import type { Summary, Transaction } from '@/types';

export interface TransactionFilters {
  tnx_type?: 'credit' | 'debit';
  date_from?: string;
  date_to?: string;
  account_id?: string;
  sort?: 'asc' | 'desc';
}

export interface CategoryTotal {
  category: Category;
  total: number;
}

export interface DailyTotal {
  date: string;
  expense: number;
  income: number;
}

export interface UseTransactionsReturn {
  transactions: Transaction[];
  summary: Summary;
  categoryTotals: CategoryTotal[];
  dailyTotals: DailyTotal[];
  loading: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  pagination: PaginationInfo | null;
  error: string | null;
  filters: TransactionFilters;
  setFilters: (filters: TransactionFilters) => void;
}

export function useTransactions(): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [summary, setSummary]           = useState<Summary>({ income: 0, expense: 0, balance: 0 });
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [dailyTotals, setDailyTotals]       = useState<DailyTotal[]>([]);
  const [pagination, setPagination]        = useState<PaginationInfo | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore]  = useState(false);
  const [filters, setFilters]               = useState<TransactionFilters>({
    sort: 'desc',
  });

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const transactionsRef = useRef<Transaction[]>([]);
  transactionsRef.current = transactions;

  const computeDerivedData = useCallback((txns: Transaction[]) => {
    const income = txns.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const expense = txns.filter((t) => t.type !== 'credit').reduce((s, t) => s + t.amount, 0);
    setSummary({ income, expense, balance: income - expense });

    const catMap: Partial<Record<Category, number>> = {};
    for (const t of txns) {
      if (t.type === 'credit') continue;
      catMap[t.category] = (catMap[t.category] ?? 0) + t.amount;
    }
    const catTotals: CategoryTotal[] = Object.entries(catMap)
      .map(([cat, total]) => ({ category: cat as Category, total: total as number }))
      .sort((a, b) => b.total - a.total);
    setCategoryTotals(catTotals);

    const today = new Date();
    const last7: DailyTotal[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const date = d.toISOString().split('T')[0];

      const dayTxns = txns.filter((t) => t.date === date);
      const exp = dayTxns.filter((t) => t.type !== 'credit').reduce((s, t) => s + t.amount, 0);
      const inc = dayTxns.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
      return { date, expense: exp, income: inc };
    });
    setDailyTotals(last7);
  }, []);

  const loadTransactions = useCallback(async (page: number, append = false, currentFilters?: TransactionFilters) => {
    const result = await fetchTransactions({ page, sort: 'desc', ...(currentFilters ?? filtersRef.current) });
    
    if (result.error) {
      setError(result.error);
      if (!append) {
        setTransactions([]);
        setSummary({ income: 0, expense: 0, balance: 0 });
        setCategoryTotals([]);
        setDailyTotals([]);
      }
      return false;
    }

    setError(null);
    setPagination(result.pagination);
    
    if (append) {
      const newTransactions = [...transactionsRef.current, ...result.transactions];
      setTransactions(newTransactions);
      computeDerivedData(newTransactions);
    } else {
      setTransactions(result.transactions);
      computeDerivedData(result.transactions);
    }
    return true;
  }, [computeDerivedData]);

  const reload = useCallback(async () => {
    setLoading(true);
    await loadTransactions(1, false, filters);
    setLoading(false);
  }, [loadTransactions, filters]);

  const loadMore = useCallback(async () => {
    if (!pagination || isLoadingMore) return;
    if (pagination.page >= pagination.total_pages) return;

    setIsLoadingMore(true);
    try {
      await loadTransactions(pagination.page + 1, true, filters);
    } finally {
      setIsLoadingMore(false);
    }
  }, [pagination, isLoadingMore, loadTransactions, filters]);

  const handleSetFilters = useCallback(async (newFilters: TransactionFilters) => {
    setFilters(newFilters);
    setLoading(true);
    await loadTransactions(1, false, newFilters);
    setLoading(false);
  }, [loadTransactions]);

  useEffect(() => {
    async function initialLoad() {
      setLoading(true);
      try {
        await loadTransactions(1, false, filters);
      } catch (e) {
        console.error('Initial load error:', e);
      } finally {
        setLoading(false);
      }
    }
    initialLoad();
  }, []);

  return {
    transactions,
    summary,
    categoryTotals,
    dailyTotals,
    loading,
    reload,
    loadMore,
    hasMore: pagination ? pagination.page < pagination.total_pages : false,
    isLoadingMore,
    pagination,
    error,
    filters,
    setFilters: handleSetFilters,
  };
}
