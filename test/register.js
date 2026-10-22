// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Lets the unit tests require the app's TypeScript files (.ts and .tsx): they're compiled with the
// project's TypeScript, and the modules that need React Native or a device are replaced by stand-ins
// that do nothing (the tests are about the app's own logic). Required first by each test.
const Module = require("module");
const fs = require("fs");
const ts = require("typescript");

function compile(module, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });
  module._compile(outputText, filename);
}
Module._extensions[".ts"] = compile;
Module._extensions[".tsx"] = compile;

// Any property of it is a function that does nothing (and gives undefined)
function nothing(known = {}) {
  return new Proxy(known, {
    get: (target, key) => (key in target) ? target[key] : (key === "__esModule") ? true : () => undefined,
  });
}

// What's kept in the device's storage, in memory
const stored = new Map();
const storage = {
  getItem: async (key) => stored.get(key) ?? null,
  setItem: async (key, value) => void stored.set(key, value),
  removeItem: async (key) => void stored.delete(key),
  keys: async () => Array.from(stored.keys()),
  getAllKeys: async () => Array.from(stored.keys()),
  clear: async () => stored.clear(),
};
// (as an ES module, so that the app's "import * as" gets it as it is)
const asModule = (x) => Object.assign(x, { __esModule: true, default: x });

const stubs = {
  "react-native": nothing({
    Platform: { OS: "web", select: (x) => ("web" in x) ? x.web : x.default },
    StyleSheet: { create: (x) => x, hairlineWidth: 1, absoluteFill: {} },
    AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
  }),
  "react-native-paper": nothing(),
  "expo-secure-store": nothing(),
  "localforage": asModule(storage),
  "@react-native-async-storage/async-storage": { __esModule: true, default: undefined },
};

const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) {
    return stubs[request];
  }
  return load.call(this, request, parent, isMain);
};

// (set by the bundler)
global.__DEV__ = false;
