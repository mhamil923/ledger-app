import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore isn't available on web — fall back to localStorage.
async function webGet(key: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage.getItem(key);
}

async function webSet(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(key, value);
}

async function webDelete(key: string): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(key);
}

export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return webGet(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return webSet(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') return webDelete(key);
    return SecureStore.deleteItemAsync(key);
  },
};
