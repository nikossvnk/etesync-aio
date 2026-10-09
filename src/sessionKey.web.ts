// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Browsers have no secure storage to keep a key in, so the saved session is not encrypted with one

export const sessionKeySupported = false;

export async function getSessionKey(): Promise<Uint8Array | undefined> {
  return undefined;
}

export async function getOrCreateSessionKey(): Promise<Uint8Array | undefined> {
  return undefined;
}
