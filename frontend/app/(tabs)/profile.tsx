import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  RefreshControl,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { apiPost } from "@/src/api";

export default function Profile() {
  const { user, partner, refresh, signOut } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [myCode, setMyCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const createCode = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const data = await apiPost("/couple/create", {});
      setMyCode(data.code);
      await refresh();
    } catch (e: any) {
      setMsg(e?.message || "Could not create code");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim()) {
      setMsg("Enter a pair code");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/couple/join", { code: code.trim().toUpperCase() });
      await refresh();
      setMsg("Paired! 💗");
      setCode("");
    } catch (e: any) {
      setMsg(e?.message || "Could not join");
    } finally {
      setBusy(false);
    }
  };

  const unpair = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/couple/leave", {});
      setMyCode(null);
      await refresh();
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (c: string) => {
    try {
      await Clipboard.setStringAsync(c);
      setMsg("Code copied to clipboard");
    } catch {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const paired = !!partner;

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <Text style={styles.title}>Profile</Text>

        <View style={styles.card} testID="profile-me-card">
          <View style={styles.avatar}>
            <Text style={{ fontSize: 32 }}>{user?.avatarEmoji || "💗"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>

        <Text style={styles.section}>Pairing</Text>

        {paired ? (
          <View style={styles.card} testID="profile-partner-card">
            <View style={[styles.avatar, { backgroundColor: colors.brandTertiary }]}>
              <Text style={{ fontSize: 32 }}>{partner?.avatarEmoji || "💗"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{partner?.name}</Text>
              <Text style={styles.email}>{partner?.email}</Text>
              <Text style={styles.pairedBadge}>Paired 💗</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.pairBlock}>
              <Text style={styles.pairLabel}>1) Get your pair code</Text>
              <Text style={styles.pairHint}>Share this code with your partner so they can join.</Text>
              {myCode ? (
                <Pressable onPress={() => copyCode(myCode)} style={styles.codeBox} testID="my-pair-code">
                  <Text style={styles.codeText}>{myCode}</Text>
                  <Text style={styles.codeSub}>Tap to copy</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.primary, busy && { opacity: 0.6 }]}
                  onPress={createCode}
                  disabled={busy}
                  testID="create-pair-code-button"
                >
                  <Text style={styles.primaryText}>Generate my code</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.pairBlock, { marginTop: spacing.lg }]}>
              <Text style={styles.pairLabel}>2) Or enter your partner’s code</Text>
              <TextInput
                testID="pair-code-input"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="e.g. AB12CD"
                placeholderTextColor={colors.onSurfaceMuted}
                autoCapitalize="characters"
                style={styles.input}
                maxLength={8}
              />
              <Pressable
                style={[styles.primary, busy && { opacity: 0.6 }]}
                onPress={join}
                disabled={busy}
                testID="join-pair-button"
              >
                <Text style={styles.primaryText}>Join</Text>
              </Pressable>
            </View>
          </>
        )}

        {msg ? <Text style={styles.msg} testID="profile-msg">{msg}</Text> : null}

        <View style={{ height: spacing.xl }} />

        {paired && (
          <Pressable style={styles.secondary} onPress={unpair} testID="unpair-button">
            <Text style={styles.secondaryText}>Unpair</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.secondary, { borderColor: colors.error }]}
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/sign-in");
          }}
          testID="signout-button"
        >
          <Text style={[styles.secondaryText, { color: colors.error }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.lg },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface2,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  email: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  pairedBadge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.onSurfaceMuted,
  },
  pairBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pairLabel: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  pairHint: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 3,
    fontWeight: "700",
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  primary: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    ...shadow.soft,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  codeBox: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  codeText: { fontSize: 30, fontWeight: "800", letterSpacing: 6, color: colors.onSurface },
  codeSub: { marginTop: spacing.xs, fontSize: 11, color: colors.onSurfaceMuted },
  msg: { marginTop: spacing.md, textAlign: "center", color: colors.onSurfaceMuted },
  secondary: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  secondaryText: { fontWeight: "700", color: colors.onSurface },
});
