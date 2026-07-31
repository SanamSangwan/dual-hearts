import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { apiGet, apiPost } from "@/src/api";

type Stats = { total: number; byType: { kiss: number; heart: number; miss: number } };

const GESTURES = [
  {
    key: "kiss",
    emoji: "💋",
    label: "Send a Kiss",
    hint: "A quick smooch to make them smile",
    color: "#F4978E",
    haptic: Haptics.ImpactFeedbackStyle.Heavy,
    testID: "send-kiss-button",
  },
  {
    key: "heart",
    emoji: "❤️",
    label: "Send a Heart",
    hint: "Let them know you care",
    color: "#E66A65",
    haptic: Haptics.ImpactFeedbackStyle.Light,
    testID: "send-heart-button",
  },
  {
    key: "miss",
    emoji: "🥺",
    label: "I Miss You",
    hint: "Feeling far apart? Say so.",
    color: "#C85A56",
    haptic: Haptics.ImpactFeedbackStyle.Medium,
    testID: "send-miss-button",
  },
] as const;

export default function Home() {
  const { user, partner, refresh } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ total: 0, byType: { kiss: 0, heart: 0, miss: 0 } });
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await apiGet("/gestures/stats");
      setStats(s);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      load();
    }, [load, refresh])
  );

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const onSend = async (type: string, haptic: Haptics.ImpactFeedbackStyle) => {
    if (!partner) {
      router.push("/(tabs)/profile");
      return;
    }
    setSending(type);
    Haptics.impactAsync(haptic).catch(() => {});
    try {
      await apiPost("/gestures", { type });
      setToast(`Sent ${type === "miss" ? "an I-miss-you" : `a ${type}`} to ${partner.name} 💗`);
      load();
    } catch (e: any) {
      setToast(e?.message || "Could not send");
    } finally {
      setSending(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), load()]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <Text style={styles.hello} testID="home-greeting">Hi, {user?.name} 👋</Text>
          <Text style={styles.subhello}>Send a little love today</Text>
        </View>

        <PairCard partner={partner} onGoPair={() => router.push("/(tabs)/profile")} />

        <View style={styles.statsRow}>
          <StatChip emoji="💋" label="Kisses" count={stats.byType.kiss} />
          <StatChip emoji="❤️" label="Hearts" count={stats.byType.heart} />
          <StatChip emoji="🥺" label="Misses" count={stats.byType.miss} />
        </View>

        <View style={{ height: spacing.lg }} />

        {GESTURES.map((g) => (
          <GestureButton
            key={g.key}
            emoji={g.emoji}
            label={g.label}
            hint={g.hint}
            color={g.color}
            testID={g.testID}
            disabled={sending !== null || !partner}
            loading={sending === g.key}
            onPress={() => onSend(g.key, g.haptic)}
          />
        ))}

        <Text style={styles.footNote}>
          Tap and hold the moments – every gesture appears on your shared Timeline.
        </Text>
      </ScrollView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none" testID="home-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function PairCard({ partner, onGoPair }: { partner: any; onGoPair: () => void }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [pulse]);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (!partner) {
    return (
      <Pressable onPress={onGoPair} style={styles.pairCard} testID="pair-cta-card">
        <Animated.Text style={[styles.pairEmoji, animStyle]}>💞</Animated.Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.pairTitle}>You’re not paired yet</Text>
          <Text style={styles.pairSub}>Tap here to invite your partner or enter their code.</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.pairCard} testID="paired-card">
      <Animated.Text style={[styles.pairEmoji, animStyle]}>💗</Animated.Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.pairTitle}>Paired with {partner.name}</Text>
        <Text style={styles.pairSub}>You two are connected. Send them something sweet.</Text>
      </View>
    </View>
  );
}

function StatChip({ emoji, label, count }: { emoji: string; label: string; count: number }) {
  return (
    <View style={styles.statChip}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function GestureButton({
  emoji,
  label,
  hint,
  color,
  testID,
  disabled,
  loading,
  onPress,
}: {
  emoji: string;
  label: string;
  hint: string;
  color: string;
  testID: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const floatY = useSharedValue(0);
  const floatOpacity = useSharedValue(0);

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.95, { duration: 90 }),
      withTiming(1, { duration: 200 })
    );
    floatOpacity.value = 1;
    floatY.value = 0;
    floatY.value = withTiming(-140, { duration: 900, easing: Easing.out(Easing.quad) });
    floatOpacity.value = withTiming(0, { duration: 900 }, () => {
      runOnJS(onPress)();
    });
  };

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const floatStyle = useAnimatedStyle(() => ({
    opacity: floatOpacity.value,
    transform: [{ translateY: floatY.value }],
  }));

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Animated.View style={btnStyle}>
        <Pressable
          testID={testID}
          disabled={disabled}
          onPress={handlePress}
          style={[
            styles.gestureBtn,
            { backgroundColor: color },
            disabled && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.gestureEmoji}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gestureLabel}>{label}</Text>
            <Text style={styles.gestureHint}>{loading ? "Sending…" : hint}</Text>
          </View>
        </Pressable>
      </Animated.View>
      <Animated.Text style={[styles.floatEmoji, floatStyle]} pointerEvents="none">
        {emoji}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.lg },
  hello: { fontSize: 28, fontWeight: "700", color: colors.onSurface },
  subhello: { marginTop: 2, fontSize: 14, color: colors.onSurfaceMuted },
  pairCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pairEmoji: { fontSize: 34 },
  pairTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  pairSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCount: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  statLabel: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },
  gestureBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    paddingVertical: 22,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadow.soft,
  },
  gestureEmoji: { fontSize: 40 },
  gestureLabel: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: 0.2 },
  gestureHint: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  floatEmoji: {
    position: "absolute",
    right: 40,
    top: 20,
    fontSize: 42,
  },
  footNote: {
    marginTop: spacing.lg,
    fontSize: 12,
    color: colors.onSurfaceMuted,
    textAlign: "center",
  },
  toast: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xl,
    backgroundColor: colors.onSurface,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
