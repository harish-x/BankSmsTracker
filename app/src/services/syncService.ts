/**
 * syncService.ts
 * Sends each unsynced transaction's raw SMS to POST /expensemetric.
 * The server parses the SMS and stores its own record.
 * On success the local row is marked synced = 1.
 *
 * Auth: Bearer token from authService. On 401 it attempts a token refresh
 * once before giving up.
 */

import axios from "axios";

import { API_BASE_URL } from "@/constants/api";
import { getAccessToken, refreshAccessToken } from "@/services/authService";
import { getUnsyncedTransactions, markAsSynced } from "./dbService";

export interface SyncResult {
  synced: number;
  error?: string;
  authExpired?: boolean;
}

/**
 * Sends all unsynced local transactions to the backend via /expensemetric.
 * Safe to call even when there's nothing to sync (returns { synced: 0 }).
 */
export async function syncTransactions(): Promise<SyncResult> {
  try {
    const transactions = await getUnsyncedTransactions();
    if (transactions.length === 0) return { synced: 0 };

    let token = await getAccessToken();
    if (!token)
      return { synced: 0, error: "Not authenticated", authExpired: true };

    const syncedIds: number[] = [];

    for (const tx of transactions) {
      try {
        await postExpenseMetric(tx.rawSms, tx.date, token);
        if (tx.id != null) syncedIds.push(tx.id);
      } catch (err: unknown) {
        // On 401 try refreshing the token once, then retry this message
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          const newToken = await refreshAccessToken();
          if (!newToken)
            return {
              synced: syncedIds.length,
              error: "Session expired. Please log in again.",
              authExpired: true,
            };
          token = newToken;

          try {
            await postExpenseMetric(tx.rawSms, tx.date, token);
            if (tx.id != null) syncedIds.push(tx.id);
          } catch (retryErr: unknown) {
            // Skip this message — don't abort the whole batch
            console.warn("[Sync] Failed after token refresh:", retryErr);
          }
        } else {
          console.warn("[Sync] Failed to send message:", err);
        }
      }
    }

    // Persist synced state for all successfully sent rows
    if (syncedIds.length > 0) {
      await markAsSynced(syncedIds);
    }

    return { synced: syncedIds.length };
  } catch (err: unknown) {
    return {
      synced: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function postExpenseMetric(message: string, _date: string, token: string) {
  return axios.post(
    `${API_BASE_URL}/expensemetric`,
    { message },
    {
      timeout: 15_000,
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}
