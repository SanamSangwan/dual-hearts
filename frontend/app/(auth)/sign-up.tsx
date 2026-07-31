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
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) {
      setErr("Email and password are required.");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await signUp(email.trim(), password, name.trim() || undefined);
    } catch (e: any) {
      setErr(e?.message || "Could not sign up");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.form}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>OurSpace</Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.sub}>Then pair with the one you love.</Text>

        {err ? (
          <View style={styles.errorBox} testID="signup-error">
            <Text style={styles.errorText}>{err}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            testID="signup-name-input"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Alex"
            placeholderTextColor={colors.onSurfaceMuted}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="signup-email-input"
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
            testID="signup-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.onSurfaceMuted}
            secureTextEntry
            style={styles.input}
          />
        </View>

        <Pressable
          testID="signup-submit-button"
          onPress={onSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.primary, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <Text style={styles.primaryText}>{loading ? "Creating…" : "Create Account"}</Text>
        </Pressable>

        <Pressable
          testID="goto-signin-link"
          onPress={() => router.replace("/(auth)/sign-in")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkStrong}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  form: { flex: 1 },
  formContent: { padding: spacing.xl, paddingTop: spacing.xxxl + spacing.lg, paddingBottom: spacing.xxxl },
  brand: { fontSize: 22, fontWeight: "700", color: colors.brand, marginBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface },
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
