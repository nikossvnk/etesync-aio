// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The TextDecoder that comes with Expo on native only supports UTF-8 and throws for anything else.
// libsodium creates a UTF-16LE decoder while initialising, so without this Etebase.ready is rejected
// and the app never gets past the loading stage.
const NativeTextDecoder = (globalThis as any).TextDecoder;

function supportsUtf16le() {
  try {
    new NativeTextDecoder("utf-16le");
    return true;
  } catch {
    return false;
  }
}

if (NativeTextDecoder && !supportsUtf16le()) {
  class Utf16leDecoder {
    public readonly encoding = "utf-16le";
    public readonly fatal = false;
    public readonly ignoreBOM = false;

    public decode(input?: ArrayBuffer | ArrayBufferView) {
      if (!input) {
        return "";
      }
      const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);
      let ret = "";
      for (let i = 0 ; i + 1 < bytes.length ; i += 2) {
        ret += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
      }
      return ret;
    }
  }

  const TextDecoderShim = function (label?: string, options?: unknown) {
    if (/^\s*(utf-16le|utf-16|ucs-2|unicode)\s*$/i.test(label ?? "")) {
      return new Utf16leDecoder();
    }
    return new NativeTextDecoder(label, options);
  };
  TextDecoderShim.prototype = NativeTextDecoder.prototype;
  (globalThis as any).TextDecoder = TextDecoderShim;
}
