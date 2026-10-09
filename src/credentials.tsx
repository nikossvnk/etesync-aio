// SPDX-FileCopyrightText: © 2017 Etebase Authors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSelector } from "react-redux";
import { createSelector } from "reselect";

import * as Etebase from "etebase";

import * as store from "./store";
import { login } from "./store/actions";
import { usePromiseMemo } from "./helpers";
import { getSessionKey, sessionKeySupported } from "./sessionKey";
import { logger } from "./logging";

async function restoreSession(storedSession: string) {
  try {
    const sessionKey = await getSessionKey();
    if (sessionKey) {
      try {
        return await Etebase.Account.restore(storedSession, sessionKey);
      } catch (e) {
        // Could still be a session from before they were saved with a key
      }
    }

    const etebase = await Etebase.Account.restore(storedSession);
    if (sessionKeySupported) {
      // Saved by a version that didn't use a key yet, save it again with one
      store.store.dispatch(login(etebase));
    }
    return etebase;
  } catch (e) {
    // The session can't be read (e.g. the key was lost), so the user has to log in again
    logger.warn(`Failed restoring the session: ${e}`);
    return null;
  }
}

export const credentialsSelector = createSelector(
  (state: store.StoreState) => state.credentials.storedSession,
  (storedSession) => {
    if (storedSession) {
      return restoreSession(storedSession);
    } else {
      return Promise.resolve(null);
    }
  }
);

export function useCredentials() {
  const credentialsPromise = useSelector(credentialsSelector);
  return usePromiseMemo(credentialsPromise, [credentialsPromise]);
}
