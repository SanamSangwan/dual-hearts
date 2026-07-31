import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";

const BG_IMAGE =
  "https://images.unsplash.com/photo-1575388104683-e076ee9ccaa0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwxfHxjb3VwbGUlMjBob2xkaW5nJTIwaGFuZHMlMjByb21hbnRpYyUyMHN1bnNldHxlbnwwfHx8fDE3ODU0MjE3MDJ8MA&ixlib=rb-4.1.0&q=85";

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) {
      setErr("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await signIn(email.trim(), password);
    } catch (e: any) {
      setErr(e?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <Image source={{ uri: BG_IMAGE }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient
          colors={["rgba(255,249,248,0.1)", "rgba(255,249,248,0.85)", colors.surface]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroContent}>
          <Text style={styles.brand} testID="app-title">OurSpace</Text>
          <Text style={styles.tag}>A tiny world made just for the two of you.</Text>
        </View>
      </View>

      <ScrollView
        style={styles.form}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Welcome back 💗</Text>
        <Text style={styles.sub}>Sign in to send love.</Text>

        {err ? (
          <View style={styles.errorBox} testID="signin-error">
            <Text style={styles.errorText}>{err}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="signin-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.onSurfaceMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            testID="signin-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.onSurfaceMuted}
            secureTextEntry
            style={styles.input}
          />
        </View>

        <Pressable
          testID="signin-submit-button"
          onPress={onSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.primary, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <Text style={styles.primaryText}>{loading ? "Signing in…" : "Sign In"}</Text>
        </Pressable>

        <Pressable
          testID="goto-signup-link"
          onPress={() => router.push("/(auth)/sign-up")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>
            New here? <Text style={styles.linkStrong}>Create an account</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 280, width: "100%", overflow: "hidden" },
  heroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: spacing.xl,
  },
  brand: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.5,
  },
  tag: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: colors.onSurface,
    opacity: 0.85,
  },
  form: { flex: 1 },
  formContent: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface },
  sub: { marginTop: spacing.xs, fontSize: 14, color: colors.onSurfaceMuted, marginBottom: spacing.lg },
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurfaceMuted,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primary: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    ...shadow.soft,
  },
  primaryText: { color: colors.onBrand, fontWeight: "700", fontSize: 16, letterSpacing: 0.3 },
  linkBtn: { marginTop: spacing.lg, alignItems: "center" },
  linkText: { color: colors.onSurfaceMuted, fontSize: 14 },
  linkStrong: { color: colors.brand, fontWeight: "700" },
  errorBox: {
    backgroundColor: "#FCE1E0",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorText: { color: "#8A2A28", fontSize: 13 },
});
