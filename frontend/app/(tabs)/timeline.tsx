import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/src/theme";
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";

type Gesture = {
  id: string;
  type: "kiss" | "heart" | "miss";
  senderId: string;
  senderName?: string;
  message?: string | null;
  createdAt: string;
};

const EMOJI: Record<string, string> = { kiss: "💋", heart: "❤️", miss: "🥺" };
const LABEL: Record<string, string> = {
  kiss: "sent a kiss",
  heart: "sent a heart",
  miss: "is missing you",
};

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Timeline() {
  const { user, partner } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Gesture[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet("/gestures");
      setItems(data.items || []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Could not load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const renderItem = ({ item }: { item: Gesture }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]} testID={`gesture-${item.id}`}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={styles.emoji}>{EMOJI[item.type]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.who}>
              {isMe ? "You" : item.senderName || "Partner"}{" "}
              <Text style={styles.action}>{LABEL[item.type]}</Text>
            </Text>
            {item.message ? <Text style={styles.msg}>“{item.message}”</Text> : null}
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title} testID="timeline-title">Timeline</Text>
        <Text style={styles.sub}>
          {partner ? `Every gesture with ${partner.name}` : "Pair with your partner to see gestures"}
        </Text>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Loading your love notes…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>💌</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.empty}>
            {partner ? "Be the first to send some love today!" : "Pair first, then start sending kisses."}
          </Text>
          <Pressable
            testID="timeline-cta-home"
            style={styles.primary}
            onPress={() => router.push(partner ? "/(tabs)" : "/(tabs)/profile")}
          >
            <Text style={styles.primaryText}>{partner ? "Go send love" : "Pair now"}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {err ? <Text style={styles.error}>{err}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  row: { flexDirection: "row" },
  rowMe: { justifyContent: "flex-end" },
  rowThem: { justifyContent: "flex-start" },
  bubble: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    maxWidth: "88%",
    borderWidth: 1,
  },
  bubbleMe: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.borderStrong,
    borderTopRightRadius: 6,
  },
  bubbleThem: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderTopLeftRadius: 6,
  },
  emoji: { fontSize: 28 },
  who: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  action: { fontWeight: "500", color: colors.onSurfaceMuted },
  msg: { marginTop: 4, fontSize: 13, color: colors.onSurface, fontStyle: "italic" },
  time: { marginTop: 4, fontSize: 11, color: colors.onSurfaceMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.xs },
  empty: { color: colors.onSurfaceMuted, textAlign: "center" },
  primary: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  error: {
    padding: spacing.md,
    color: colors.error,
    textAlign: "center",
  },
});
