import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = "https://oyllhknjcvttszqejbjw.supabase.co";
const supabaseAnonKey = "sb_publishable_LJzgWWgshhbB59Ml5Gk8AQ_eXKLBcMd";

const memoryStorage = {
  store: {},
  getItem(key) {
    return Promise.resolve(this.store[key] ?? null);
  },
  setItem(key, value) {
    this.store[key] = value;
    return Promise.resolve();
  },
  removeItem(key) {
    delete this.store[key];
    return Promise.resolve();
  },
};

const webStorage = {
  getItem(key) {
    if (typeof window === "undefined") return Promise.resolve(null);
    return Promise.resolve(window.localStorage.getItem(key));
  },
  setItem(key, value) {
    if (typeof window === "undefined") return Promise.resolve();
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem(key) {
    if (typeof window === "undefined") return Promise.resolve();
    window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const storage =
  Platform.OS === "web"
    ? typeof window === "undefined"
      ? memoryStorage
      : webStorage
    : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});