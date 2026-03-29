// The type of a bank transaction
export type TransactionType = 'credit' | 'debit' | 'fee';

// Which bank sent the SMS
export type BankName = 'HDFC' | 'Kotak';

// Spending categories
export type Category =
  | 'income'
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'utilities'
  | 'health'
  | 'transfer'
  | 'fee'
  | 'alcohol'
  | 'other';

// One parsed transaction
export interface Transaction {
  id?: number;
  bank: BankName;
  type: TransactionType;
  amount: number;
  merchant: string;    // who sent/received money, or reason
  account: string;     // last 4 digits of account e.g. "9910"
  refNumber?: string;  // UPI ref / NEFT ref
  date: string;        // ISO date string  e.g. "2026-03-25"
  category: Category;
  rawSms: string;      // original SMS body
  synced: number;      // 0 = not yet sent to server, 1 = sent
  createdAt: string;   // when we stored it
}

// Row from SQLite (snake_case columns)
export interface TransactionRow {
  id: number;
  bank: BankName;
  type: TransactionType;
  amount: number;
  merchant: string;
  account: string;
  ref_number: string | null;
  date: string;
  category: Category;
  raw_sms: string;
  synced: number;
  created_at: string;
}

// Dashboard summary numbers
export interface Summary {
  income: number;
  expense: number;
  balance: number;
}

// What we POST to the backend
export interface SyncPayload {
  transactions: Omit<Transaction, 'id' | 'synced'>[];
}
