import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "os_access_token";

const webStorage = {
  get: (k: string) =>
    typeof window !== "undefined" ? window.localStorage.getItem(k) : null,
  set: (k: string, v: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(k, v);
  },
  del: (k: string) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(k);
  },
};

export async function saveToken(token: string) {
  if (Platform.OS === "web") webStorage.set(TOKEN_KEY, token);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") return webStorage.get(TOKEN_KEY);
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  if (Platform.OS === "web") webStorage.del(TOKEN_KEY);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function authHeaders(): Promise<Record<string, string>> {
  const t = await loadToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function handle(res: Response) {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export async function apiGet(path: string) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { ...(await authHeaders()) },
  });
  return handle(res);
}

export async function apiPost(path: string, body: any) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function apiDelete(path: string) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  return handle(res);
}

// OAuth2 password flow uses form-encoded body
export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }).toString(),
  });
  return handle(res);
}

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatarEmoji: string;
  coupleId: string | null;
};
