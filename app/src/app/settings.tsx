/**
 * Settings screen
 * - Account info (name/email) + Edit + Logout + Delete Account
 * - Manual SMS scan + sync triggers
 * - Background sync toggle
 * - Clear all local data
 * - App info
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import {
  Account,
  createAccount,
  deleteAccount,
  getAccounts,
  updateAccount,
} from "@/services/accountService";
import {
  clearAllTransactions,
  getSetting,
  setSetting,
} from "@/services/dbService";
import { checkAndSaveSms } from "@/services/smsService";
import { syncTransactions } from "@/services/syncService";
import {
  registerBackgroundSync,
  unregisterBackgroundSync,
} from "@/tasks/backgroundSync";

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const c = isDark ? DARK : LIGHT;

  const { signOut, isAuthenticated } = useAuth();

  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [bgEnabled, setBgEnabled] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // ── Bank accounts state ──────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  // null = not adding; object = adding/editing (id undefined = new)
  const [editingAccount, setEditingAccount] = useState<{
    id?: string;
    bank_name: string;
    account_mask: string;
  } | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const email = await getSetting("user_email");
      const name = await getSetting("user_name");
      if (email) setUserEmail(email);
      if (name) setUserName(name);
      const bg = await getSetting("bg_sync_enabled");
      setBgEnabled(bg !== "false");
    })();
    loadAccounts();
  }, []);

  function showStatus(msg: string) {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(""), 4000);
  }

  // ── Account actions ────────────────────────────────────────────────────────

  function handleEditName() {
    setNameInput(userName);
    setEditingName(true);
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    await setSetting("user_name", trimmed);
    setUserName(trimmed);
    setEditingName(false);
    showStatus("✓ Name updated");
  }

  function handleCancelEdit() {
    setEditingName(false);
  }

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  }

  function handleDeleteProfile() {
    Alert.alert(
      "Delete Account",
      "This will remove all local data and sign you out. Data already synced to the server is NOT affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await clearAllTransactions();
            await signOut();
          },
        },
      ],
    );
  }

  // ── Bank account actions ───────────────────────────────────────────────────

  async function loadAccounts() {
    setAccountsLoading(true);
    const result = await getAccounts();
    setAccountsLoading(false);
    if (result.authExpired) {
      showStatus("✗ Session expired. Please sign in again.");
      signOut();
      return;
    }
    if (result.accounts) {
      setAccounts(result.accounts);
    } else if (result.error) {
      showStatus(`✗ Failed to load accounts: ${result.error}`);
    }
  }

  function handleAddAccount() {
    setEditingAccount({ bank_name: "", account_mask: "" });
  }

  function handleEditAccount(acc: Account) {
    setEditingAccount({
      id: acc.id,
      bank_name: acc.bank_name,
      account_mask: acc.account_mask,
    });
  }

  async function handleSaveAccount() {
    if (!editingAccount) return;
    const { id, bank_name, account_mask } = editingAccount;
    if (!bank_name.trim() || !account_mask.trim()) {
      showStatus("✗ Bank name and account number are required");
      return;
    }
    setAccountSaving(true);
    if (id) {
      const result = await updateAccount(
        id,
        bank_name.trim(),
        account_mask.trim(),
      );
      if (result.authExpired) {
        showStatus("✗ Session expired. Please sign in again.");
        signOut();
        setAccountSaving(false);
        return;
      }
      if (result.error) showStatus(`✗ ${result.error}`);
      else {
        showStatus("✓ Account updated");
        await loadAccounts();
        setEditingAccount(null);
      }
    } else {
      const result = await createAccount(bank_name.trim(), account_mask.trim());
      if (result.authExpired) {
        showStatus("✗ Session expired. Please sign in again.");
        signOut();
        setAccountSaving(false);
        return;
      }
      if (result.error) showStatus(`✗ ${result.error}`);
      else {
        showStatus("✓ Account added");
        await loadAccounts();
        setEditingAccount(null);
      }
    }
    setAccountSaving(false);
  }

  function handleDeleteAccount(acc: Account) {
    Alert.alert(
      "Delete Account",
      `Remove "${acc.bank_name} ••••${acc.account_mask}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const result = await deleteAccount(acc.id);
            if (result.authExpired) {
              showStatus("✗ Session expired. Please sign in again.");
              signOut();
              return;
            }
            if (result.error) showStatus(`✗ ${result.error}`);
            else {
              showStatus("✓ Account deleted");
              await loadAccounts();
            }
          },
        },
      ],
    );
  }

  // ── Sync actions ───────────────────────────────────────────────────────────

  async function handleScanSms() {
    setScanning(true);
    const count = await checkAndSaveSms();
    setScanning(false);
    showStatus(
      count > 0
        ? `✓ Found ${count} new transaction(s)`
        : "No new transactions found",
    );
  }

  async function handleSync() {
    setSyncing(true);
    const result = await syncTransactions();
    setSyncing(false);
    if (result.error) {
      showStatus(`✗ Sync failed: ${result.error}`);
    } else {
      showStatus(`✓ Synced ${result.synced} transaction(s)`);
    }
  }

  async function handleBgToggle(value: boolean) {
    setBgEnabled(value);
    await setSetting("bg_sync_enabled", String(value));
    if (value) {
      await registerBackgroundSync();
      showStatus("✓ Background sync enabled");
    } else {
      await unregisterBackgroundSync();
      showStatus("Background sync disabled");
    }
  }

  function handleClearData() {
    Alert.alert(
      "Clear All Data",
      "This will delete all transactions stored on this device. Synced data on the server is NOT affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await clearAllTransactions();
            showStatus("✓ Local data cleared");
          },
        },
      ],
    );
  }

  // ─── UI ─────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: c.bg }]}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status message */}
        {statusMsg ? (
          <View
            style={[
              styles.statusBar,
              {
                backgroundColor: statusMsg.startsWith("✓")
                  ? "#D1FAE5"
                  : "#FEE2E2",
              },
            ]}
          >
            <Text
              style={{
                color: statusMsg.startsWith("✓") ? "#065F46" : "#991B1B",
                fontWeight: "600",
                fontSize: 13,
              }}
            >
              {statusMsg}
            </Text>
          </View>
        ) : null}

        {/* ── Account ───────────────────────────────────────────────────────── */}
        <Section title="Account" c={c}>
          <View style={styles.accountRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {userName ? userName.charAt(0).toUpperCase() : "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              {editingName ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={[
                      styles.nameInput,
                      {
                        color: c.text,
                        borderColor: c.border,
                        backgroundColor: c.input,
                      },
                    ]}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                    placeholder="Your name"
                    placeholderTextColor={c.sub}
                  />
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSaveName}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={handleCancelEdit}
                  >
                    <Text style={[styles.cancelBtnText, { color: c.sub }]}>
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.nameRow}>
                  <Text style={[styles.accountName, { color: c.text }]}>
                    {userName || "No name set"}
                  </Text>
                  <TouchableOpacity
                    onPress={handleEditName}
                    style={styles.editIconBtn}
                  >
                    <Text
                      style={{
                        color: "#3B82F6",
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      Edit
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={[styles.accountEmail, { color: c.sub }]}>
                {userEmail || "Unknown"}
              </Text>
            </View>
          </View>

          <View style={styles.accountActions}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: "#EF4444", flex: 1 }]}
              onPress={handleLogout}
            >
              <Text style={styles.btnText}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                {
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: "#EF4444",
                  flex: 1,
                },
              ]}
              onPress={handleDeleteProfile}
            >
              <Text style={[styles.btnText, { color: "#EF4444" }]}>
                Delete Account
              </Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* ── Bank Accounts ─────────────────────────────────────────────────── */}
        <Section title="Bank Accounts" c={c}>
          {/* Add account form */}
          {editingAccount ? (
            <View style={[styles.accountForm, { borderColor: c.border }]}>
              <Text style={[styles.formTitle, { color: c.text }]}>
                {editingAccount.id ? "Edit Account" : "Add Account"}
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: c.text,
                    borderColor: c.border,
                    backgroundColor: c.input,
                  },
                ]}
                value={editingAccount.bank_name}
                onChangeText={(v) =>
                  setEditingAccount({ ...editingAccount, bank_name: v })
                }
                placeholder="Bank name (e.g. HDFC, Kotak)"
                placeholderTextColor={c.sub}
              />
              <TextInput
                style={[
                  styles.formInput,
                  {
                    color: c.text,
                    borderColor: c.border,
                    backgroundColor: c.input,
                  },
                ]}
                value={editingAccount.account_mask}
                onChangeText={(v) =>
                  setEditingAccount({ ...editingAccount, account_mask: v })
                }
                placeholder="Last 4 digits of Bank Account number"
                placeholderTextColor={c.sub}
                keyboardType="numeric"
                maxLength={4}
              />
              <View style={styles.formBtns}>
                <TouchableOpacity
                  style={[styles.btn, { flex: 1, backgroundColor: c.border }]}
                  onPress={() => setEditingAccount(null)}
                  disabled={accountSaving}
                >
                  <Text style={[styles.btnText, { color: c.text }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { flex: 1 }]}
                  onPress={handleSaveAccount}
                  disabled={accountSaving}
                >
                  {accountSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>
                      {editingAccount.id ? "Update" : "Add"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Account list */}
          {accountsLoading ? (
            <ActivityIndicator
              size="small"
              color="#3B82F6"
              style={{ marginVertical: 8 }}
            />
          ) : accounts.length === 0 ? (
            <Text
              style={[
                styles.hint,
                { color: c.sub, textAlign: "center", paddingVertical: 8 },
              ]}
            >
              No bank accounts added yet
            </Text>
          ) : (
            accounts.map((acc, index) => (
              <View
                key={acc.id ?? `acc-${index}`}
                style={[styles.accountListRow, { borderTopColor: c.border }]}
              >
                <View style={styles.accIconBox}>
                  <Text style={styles.accIconText}>
                    {acc.bank_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accBankName, { color: c.text }]}>
                    {acc.bank_name}
                  </Text>
                  <Text style={[styles.hint, { color: c.sub }]}>
                    ••••{acc.account_mask}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleEditAccount(acc)}
                  style={styles.accAction}
                >
                  <Text
                    style={{
                      color: "#3B82F6",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Edit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteAccount(acc)}
                  style={styles.accAction}
                >
                  <Text
                    style={{
                      color: "#EF4444",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Add button */}
          {!editingAccount ? (
            <TouchableOpacity
              style={[styles.addAccountBtn, { borderColor: "#3B82F6" }]}
              onPress={handleAddAccount}
            >
              <Text
                style={{ color: "#3B82F6", fontWeight: "700", fontSize: 14 }}
              >
                + Add Account
              </Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        {/* ── Manual Actions ────────────────────────────────────────────────── */}
        <Section title="Manual Actions" c={c}>
          <ActionRow
            label="Scan SMS Inbox"
            description="Read bank SMS for this month and save new transactions"
            c={c}
            onPress={handleScanSms}
            loading={scanning}
          />
          <ActionRow
            label="Sync to Server"
            description="Send unsynced transactions to the backend"
            c={c}
            onPress={handleSync}
            loading={syncing}
          />
        </Section>

        {/* ── Background Sync ───────────────────────────────────────────────── */}
        <Section title="Background Sync" c={c}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: c.text }]}>
                Auto-sync every 15 min
              </Text>
              <Text style={[styles.hint, { color: c.sub }]}>
                Runs in the background to check SMS and sync data even when the
                app is closed.
              </Text>
            </View>
            <Switch
              value={bgEnabled}
              onValueChange={handleBgToggle}
              trackColor={{ false: c.border, true: "#3B82F6" }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        {/* ── Danger Zone ───────────────────────────────────────────────────── */}
        <Section title="Danger Zone" c={c}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: "#EF4444" }]}
            onPress={handleClearData}
          >
            <Text style={styles.btnText}>Clear All Local Data</Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: c.sub }]}>
            Deletes all transactions from this device only. Data already synced
            to the server remains.
          </Text>
        </Section>

        {/* ── About ─────────────────────────────────────────────────────────── */}
        <Section title="About" c={c}>
          <Text style={[styles.aboutText, { color: c.sub }]}>
            Finance Tracker — Personal Edition
          </Text>
          <Text style={[styles.aboutText, { color: c.sub }]}>
            Reads HDFC & Kotak bank SMS · SQLite local storage · Syncs to Azure
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Reusable components ──────────────────────────────────────────────────────

type Colors = typeof LIGHT;

function Section({
  title,
  children,
  c,
}: {
  title: string;
  children: React.ReactNode;
  c: Colors;
}) {
  return (
    <View style={[styles.section, { backgroundColor: c.card }]}>
      <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function ActionRow({
  label,
  description,
  c,
  onPress,
  loading,
}: {
  label: string;
  description: string;
  c: Colors;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, { borderTopColor: c.border }]}
      onPress={onPress}
      disabled={loading}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: c.text }]}>{label}</Text>
        <Text style={[styles.hint, { color: c.sub }]}>{description}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="#3B82F6" />
      ) : (
        <Text style={{ color: "#3B82F6", fontWeight: "700", fontSize: 18 }}>
          ›
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const LIGHT = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  text: "#0F172A",
  sub: "#64748B",
  border: "#E2E8F0",
  input: "#F1F5F9",
};
const DARK = {
  bg: "#0F172A",
  card: "#1E293B",
  text: "#F1F5F9",
  sub: "#94A3B8",
  border: "#334155",
  input: "#0F172A",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },

  statusBar: { padding: 12, borderRadius: 10, marginBottom: 4 },

  section: { borderRadius: 16, padding: 16, gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  hint: { fontSize: 12, lineHeight: 18, marginTop: 2 },

  // Account section
  accountRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  accountName: { fontSize: 15, fontWeight: "700" },
  accountEmail: { fontSize: 13, marginTop: 2 },
  accountActions: { flexDirection: "row", gap: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  editIconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: "#3B82F6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cancelBtn: { padding: 6 },
  cancelBtnText: { fontSize: 16, fontWeight: "700" },

  btn: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    padding: 13,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchLabel: { fontSize: 14, fontWeight: "600" },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionLabel: { fontSize: 14, fontWeight: "600" },

  aboutText: { fontSize: 13, lineHeight: 20 },

  // Bank accounts
  accountListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  accIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  accIconText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  accBankName: { fontSize: 14, fontWeight: "600" },
  accAction: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  addAccountBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginTop: 4,
  },

  // Account form
  accountForm: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  formTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  formInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  formBtns: { flexDirection: "row", gap: 10 },
});
