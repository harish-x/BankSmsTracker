import axios, { AxiosError } from 'axios';

import { API_BASE_URL } from '@/constants/api';
import { getAccessToken, refreshAccessToken } from '@/services/authService';
import { Category, Transaction, TransactionType } from '@/types';

export interface ApiTransaction {
  _id: string;
  user: string;
  account_id: string;
  amount: number;
  tnx_type: 'credit' | 'debit';
  tnx_date: string;
  category: string;
  source_name: string;
  source_vpa?: string;
  raw_message: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTransactionDetail {
  _id: string;
  amount: number;
  tnx_type: 'credit' | 'debit';
  tnx_date: string;
  raw_message: string;
  source_name: string;
  source_vpa?: string;
  createdAt: string;
  updatedAt: string;
  account: {
    _id: string;
    bank_name: string;
    account_mask: string;
  } | null;
  merchant: {
    _id: string;
    original_name: string;
    alias_name: string;
    type: 'merchant' | 'person';
    category_id: string | null;
  } | null;
  category: {
    _id: string;
    name: string;
    type: 'expense' | 'income';
  };
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface TransactionsResponse {
  transactions: ApiTransaction[];
  pagination: PaginationInfo;
}

function categoryNameToType(name: string): Category {
  const normalized = name?.toLowerCase() ?? 'other';
  const categoryMap: Record<string, Category> = {
    income: 'income',
    food: 'food',
    transport: 'transport',
    shopping: 'shopping',
    entertainment: 'entertainment',
    utilities: 'utilities',
    health: 'health',
    transfer: 'transfer',
    fee: 'fee',
  };
  return categoryMap[normalized] ?? 'other';
}

function apiToTransaction(apiTx: ApiTransaction): Transaction {
  return {
    id: undefined,
    bank: 'HDFC' as const,
    type: (apiTx.tnx_type === 'credit' ? 'credit' : 'debit') as TransactionType,
    amount: apiTx.amount,
    merchant: apiTx.source_name ?? 'Unknown',
    account: apiTx.account_id?.slice(-4) ?? '',
    refNumber: apiTx._id,
    date: apiTx.tnx_date.split('T')[0],
    category: categoryNameToType(apiTx.category),
    rawSms: apiTx.raw_message,
    synced: 1,
    createdAt: apiTx.createdAt,
  };
}

export interface FetchTransactionsParams {
  page?: number;
  tnx_type?: 'credit' | 'debit';
  date_from?: string;
  date_to?: string;
  account_id?: string;
  sort?: 'asc' | 'desc';
}

export interface FetchTransactionsResult {
  transactions: Transaction[];
  pagination: PaginationInfo;
  error?: string;
}

async function fetchWithAuth<T>(
  url: string,
  token: string,
  retries = 1
): Promise<T> {
  try {
    const { data } = await axios.get<T>(url, {
      timeout: 15_000,
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 401 && retries > 0) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return fetchWithAuth(url, newToken, retries - 1);
      }
    }
    throw err;
  }
}

export async function fetchTransactions(
  params: FetchTransactionsParams = {}
): Promise<FetchTransactionsResult> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { transactions: [], pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 }, error: 'Not authenticated' };
    }

    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', String(params.page));
    if (params.tnx_type) queryParams.set('tnx_type', params.tnx_type);
    if (params.date_from) queryParams.set('date_from', params.date_from);
    if (params.date_to) queryParams.set('date_to', params.date_to);
    if (params.account_id) queryParams.set('account_id', params.account_id);
    if (params.sort) queryParams.set('sort', params.sort);

    const url = `${API_BASE_URL}/transactions${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetchWithAuth<TransactionsResponse>(url, token);

    return {
      transactions: response.transactions.map(apiToTransaction),
      pagination: response.pagination,
    };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return {
        transactions: [],
        pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 },
        error: err.response?.data?.error ?? err.message,
      };
    }
    return {
      transactions: [],
      pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 },
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function fetchTransactionDetail(id: string): Promise<{ transaction: ApiTransactionDetail | null; error?: string }> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { transaction: null, error: 'Not authenticated' };
    }

    const url = `${API_BASE_URL}/transaction/${encodeURIComponent(id)}`;
    const response = await fetchWithAuth<{ transaction: ApiTransactionDetail }>(url, token);

    return { transaction: response.transaction };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return { transaction: null, error: err.response?.data?.error ?? err.message };
    }
    return { transaction: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export interface UpdateMerchantCategoryResult {
  success: boolean;
  category?: {
    _id: string;
    name: string;
    type: 'expense' | 'income';
  };
  transactions_updated?: number;
  error?: string;
}

export async function updateMerchantCategory(
  merchantId: string,
  categoryName: string
): Promise<UpdateMerchantCategoryResult> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    const url = `${API_BASE_URL}/merchant/${encodeURIComponent(merchantId)}/category`;
    const response = await axios.put<{
      category: { _id: string; name: string; type: 'expense' | 'income' };
      transactions_updated: number;
    }>(
      url,
      { category_name: categoryName },
      {
        timeout: 15_000,
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return {
      success: true,
      category: response.data.category,
      transactions_updated: response.data.transactions_updated,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      return { success: false, error: err.response?.data?.error ?? err.message };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export interface CategoryBreakdown {
  category_id: string | null;
  category_name: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface CategoryBreakdownResponse {
  date_range: { from: string; to: string };
  account_id: string | null;
  tnx_type: 'debit' | 'credit';
  total: number;
  categories: {
    category_id: string | null;
    category_name: string;
    amount: number;
    count: number;
    percentage: number;
  }[];
}

export interface StatsSummary {
  spent: { amount: number; count: number };
  gained: { amount: number; count: number };
  net: number;
}

export interface StatisticsResponse {
  date_range: { from: string; to: string };
  account_id: string | null;
  range: StatsSummary;
  overall: StatsSummary;
}

export async function fetchCategoryBreakdown(params: {
  date_from?: string;
  date_to?: string;
  account_id?: string;
  tnx_type?: 'debit' | 'credit';
}): Promise<{ data?: CategoryBreakdownResponse; error?: string }> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { error: 'Not authenticated' };
    }

    const queryParams = new URLSearchParams();
    if (params.date_from) queryParams.set('date_from', params.date_from);
    if (params.date_to) queryParams.set('date_to', params.date_to);
    if (params.account_id) queryParams.set('account_id', params.account_id);
    if (params.tnx_type) queryParams.set('tnx_type', params.tnx_type);

    const url = `${API_BASE_URL}/getCategoryBreakdown${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetchWithAuth<CategoryBreakdownResponse>(url, token);

    return { data: response };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      return { error: err.response?.data?.error ?? err.message };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export interface SpendingTrendDay {
  date: string;
  amount: number;
  count: number;
}

export interface SpendingTrendResponse {
  period: '7d' | '15d' | 'month';
  date_range: { from: string; to: string };
  account_id: string | null;
  tnx_type: 'debit' | 'credit';
  total: number;
  days: SpendingTrendDay[];
}

export async function fetchSpendingTrend(params: {
  period?: '7d' | '15d' | 'month';
  account_id?: string;
  tnx_type?: 'debit' | 'credit';
}): Promise<{ data?: SpendingTrendResponse; error?: string }> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { error: 'Not authenticated' };
    }

    const queryParams = new URLSearchParams();
    if (params.period) queryParams.set('period', params.period);
    if (params.account_id) queryParams.set('account_id', params.account_id);
    if (params.tnx_type) queryParams.set('tnx_type', params.tnx_type);

    const url = `${API_BASE_URL}/getSpendingTrend${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetchWithAuth<SpendingTrendResponse>(url, token);

    return { data: response };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      return { error: err.response?.data?.error ?? err.message };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

interface FetchStatisticsParams {
  date_from?: string;
  date_to?: string;
  account_id?: string;
}

export async function fetchStatistics(
  params: FetchStatisticsParams
): Promise<{ data?: StatisticsResponse; error?: string }> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { error: 'Not authenticated' };
    }

    const queryParams = new URLSearchParams();
    if (params.date_from) queryParams.set('date_from', params.date_from);
    if (params.date_to) queryParams.set('date_to', params.date_to);
    if (params.account_id) queryParams.set('account_id', params.account_id);

    const url = `${API_BASE_URL}/getStatistics${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetchWithAuth<StatisticsResponse>(url, token);

    return { data: response };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      return { error: err.response?.data?.error ?? err.message };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
