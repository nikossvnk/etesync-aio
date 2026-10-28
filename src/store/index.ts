// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { createStore, applyMiddleware, Store } from "redux";
import { persistStore } from "redux-persist";
import { thunk as thunkMiddleware } from "redux-thunk";
import { useDispatch } from "react-redux";
import { ActionMeta } from "redux-actions";

import promiseMiddleware from "./promise-middleware";

import reducers, { StoreState } from "./construct";

// Workaround babel limitation
export * from "./reducers";
export * from "./construct";

const middleware = [
  thunkMiddleware,
  promiseMiddleware,
];

if (__DEV__) {
  const ignoreActions = [
    "persist/PERSIST",
    "persist/REHYDRATE",
  ];

  // Logs each action's type, whether it failed or carried a payload, and how long it took (never the
  // state or the payload, which have the decrypted data)
  middleware.push(() => (next: (action: any) => any) => (action: any) => {
    const started = performance.now();
    const result = next(action);
    if ((typeof action?.type === "string") && !ignoreActions.includes(action.type)) {
      const prefix = (action.error) ? "xx" : (action.payload !== undefined) ? "==" : "->";
      const time = new Date().toTimeString().slice(0, 8);
      console.log(`# ${prefix} ${action.type} @ ${time} (in ${(performance.now() - started).toFixed(2)} ms)`);
    }
    return result;
  });
}

// FIXME: Hack, we don't actually return a promise when one is not passed.
export function asyncDispatch<T, V>(action: ActionMeta<Promise<T> | T, V>): Promise<ActionMeta<T, V>> {
  return store.dispatch(action as any) as any;
}

export function useAsyncDispatch() {
  const dispatch = useDispatch();
  return function (action: any): any {
    return dispatch(action) as any;
  } as typeof asyncDispatch;
}

// (the reducers are typed loosely, so the state's type is given here)
export const store: Store<StoreState, any> = createStore(
  reducers as any,
  applyMiddleware(...(middleware as any[]))
);

export const persistor = persistStore(store, { manualPersist: true } as any);
