import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { apiDelete, apiGet, apiPost } from "@/src/api";

type Look = {
  id: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  createdAt: string;
};

const PROMPT_IDEAS = [
  "Elegant red evening dress",
  "Casual white summer outfit",
  "Sharp navy suit",
  "Cozy oversized hoodie",
  "Vintage denim jacket",
  "Traditional Indian sherwani",
];

export default function Wardrobe() {
  const [sourceB64, setSourceB64] = useState<string | null>(null);
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Look | null>(null);
  const [history, setHistory] = useState<Look[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet("/wardrobe/looks");
      setHistory(data.items || []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickImage = async () => {
    Haptics.selectionAsync().catch(() => {});
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr("Photo library permission is required.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setSourceUri(a.uri);
    setSourceB64(a.base64 || null);
    setResult(null);
    setErr(null);
  };

  const takePhoto = async () => {
    Haptics.selectionAsync().catch(() => {});
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setErr("Camera permission is required.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setSourceUri(a.uri);
    setSourceB64(a.base64 || null);
    setResult(null);
    setErr(null);
  };

  const generate = async () => {
    if (!sourceB64) {
      setErr("Add a photo first.");
      return;
    }
    if (!prompt.trim()) {
      setErr("Describe the outfit you want to try.");
      return;
    }
    setGenerating(true);
    setErr(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const look = await apiPost("/wardrobe/generate", {
        imageBase64: sourceB64,
        prompt: prompt.trim(),
      });
      setResult(look);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      load();
    } catch (e: any) {
      setErr(e?.message || "AI generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const removeLook = async (id: string) => {
    try {
      await apiDelete(`/wardrobe/looks/${id}`);
      setHistory((h) => h.filter((x) => x.id !== id));
      if (result?.id === id) setResult(null);
    } catch {}
  };

  const shownImage =
    result
      ? `data:${result.mimeType};base64,${result.imageBase64}`
      : sourceUri
      ? sourceUri
      : null;

  return (
    <SafeAreaView style={styles.wrap} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title} testID="wardrobe-title">Wardrobe Studio</Text>
          <Text style={styles.sub}>Try any outfit with a photo of yourself.</Text>

          <View style={styles.canvas}>
            {generating ? (
              <View style={styles.canvasEmpty}>
                <ActivityIndicator color={colors.brand} size="large" />
                <Text style={styles.canvasHint}>Tailoring your outfit…</Text>
              </View>
            ) : shownImage ? (
              <Image source={{ uri: shownImage }} style={styles.canvasImg} contentFit="cover" testID="wardrobe-result-image" />
            ) : (
              <View style={styles.canvasEmpty}>
                <Text style={{ fontSize: 44 }}>👗</Text>
                <Text style={styles.canvasHint}>Add a photo to start the magic</Text>
              </View>
            )}
          </View>

          <View style={styles.pickerRow}>
            <Pressable style={styles.pickBtn} onPress={pickImage} testID="wardrobe-pick-photo">
              <Text style={styles.pickText}>📷 Choose Photo</Text>
            </Pressable>
            <Pressable style={styles.pickBtn} onPress={takePhoto} testID="wardrobe-take-photo">
              <Text style={styles.pickText}>📸 Take Photo</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Try one of these</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {PROMPT_IDEAS.map((p) => (
              <Pressable key={p} style={styles.chip} onPress={() => setPrompt(p)} testID={`prompt-chip-${p}`}>
                <Text style={styles.chipText}>{p}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {history.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Recent Looks</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyRow}>
                {history.map((h) => (
                  <Pressable
                    key={h.id}
                    style={styles.historyItem}
                    onPress={() => setResult(h)}
                    onLongPress={() => removeLook(h.id)}
                    testID={`look-${h.id}`}
                  >
                    <Image
                      source={{ uri: `data:${h.mimeType};base64,${h.imageBase64}` }}
                      style={styles.historyImg}
                      contentFit="cover"
                    />
                    <Text style={styles.historyText} numberOfLines={1}>
                      {h.prompt}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.tip}>Long-press a look to delete it.</Text>
            </>
          )}

          {err ? (
            <View style={styles.errorBox} testID="wardrobe-error">
              <Text style={styles.errorText}>{err}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.dock}>
          <TextInput
            testID="wardrobe-prompt-input"
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the outfit (e.g. red gown)"
            placeholderTextColor={colors.onSurfaceMuted}
            style={styles.dockInput}
            multiline
          />
          <Pressable
            testID="wardrobe-generate-button"
            style={[styles.generateBtn, (generating || !sourceB64) && { opacity: 0.6 }]}
            disabled={generating || !sourceB64}
            onPress={generate}
          >
            <Text style={styles.generateText}>{generating ? "…" : "✨ Generate"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  title: { fontSize: 24, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.onSurfaceMuted, marginBottom: spacing.lg },
  canvas: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  canvasImg: { width: "100%", height: "100%" },
  canvasEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  canvasHint: { color: colors.onSurfaceMuted, fontSize: 14, fontWeight: "600" },
  pickerRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  pickBtn: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickText: { fontWeight: "600", color: colors.onSurface },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.onSurfaceMuted,
    fontWeight: "700",
  },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg, height: 44, alignItems: "center" },
  chip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipText: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  historyRow: { gap: spacing.md, paddingRight: spacing.lg },
  historyItem: { width: 96, flexShrink: 0 },
  historyImg: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface2 },
  historyText: { marginTop: 4, fontSize: 11, color: colors.onSurfaceMuted },
  tip: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: spacing.xs },
  errorBox: {
    marginTop: spacing.md,
    backgroundColor: "#FCE1E0",
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorText: { color: "#8A2A28", fontSize: 13 },
  dock: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    backgroundColor: "rgba(255,249,248,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  dockInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 96,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  generateBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 46,
    justifyContent: "center",
    ...shadow.soft,
  },
  generateText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
