// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as SecureStore from "expo-secure-store";
import * as Etebase from "etebase";

const storageKey = "sessionKey";
const options: SecureStore.SecureStoreOptions = {
  // The background sync has to be able to read it while the device is locked
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// Whether the saved session can be encrypted with a key that's kept in the device's secure storage
export const sessionKeySupported = true;

// The key the saved session is encrypted with. It's kept in the device's secure storage
// (Android Keystore, iOS Keychain), unlike the session itself which is in the app's storage.
export async function getSessionKey(): Promise<Uint8Array | undefined> {
  const stored = await SecureStore.getItemAsync(storageKey, options);
  return (stored) ? Etebase.fromBase64(stored) : undefined;
}

export async function getOrCreateSessionKey(): Promise<Uint8Array | undefined> {
  const existing = await getSessionKey();
  if (existing) {
    return existing;
  }

  const key = Etebase.randomBytes(32);
  await SecureStore.setItemAsync(storageKey, Etebase.toBase64(key), options);
  return key;
}
