// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The buttons of the editor's formatting bar: each one changes the Markdown of the note around what's
// selected, and selects what it made. Pressing one again on what it made takes it away again.

export type Edit = { text: string, start: number, end: number };

// Puts a marker on both sides of the selection (e.g. "**" for bold), or takes it away if it's there.
// Without a selection the markers go around the word the cursor is in, or are put in for typing between.
export function wrap(edit: Edit, marker: string, placeholder: string): Edit {
  const { text } = edit;
  let { start, end } = edit;
  const len = marker.length;

  // Already wrapped: just outside of the selection, or inside of it
  if (text.slice(start - len, start) === marker && text.slice(end, end + len) === marker) {
    return { text: text.slice(0, start - len) + text.slice(start, end) + text.slice(end + len), start: start - len, end: end - len };
  }
  const selected = text.slice(start, end);
  if (selected.length >= 2 * len && selected.startsWith(marker) && selected.endsWith(marker)) {
    return { text: text.slice(0, start) + selected.slice(len, -len) + text.slice(end), start, end: end - 2 * len };
  }

  if (start === end) {
    // The word the cursor is in
    const before = text.slice(0, start).match(/[\p{L}\p{N}_]*$/u)![0];
    const after = text.slice(start).match(/^[\p{L}\p{N}_]*/u)![0];
    start -= before.length;
    end += after.length;
  }
  const inner = (start === end) ? placeholder : text.slice(start, end);
  return {
    text: text.slice(0, start) + marker + inner + marker + text.slice(end),
    start: start + len,
    end: start + len + inner.length,
  };
}

// The lines the selection is on: where the first starts and the last ends
function lineRange(text: string, start: number, end: number) {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  // A selection that ends right at the start of a line doesn't take that line in
  const last = (end > start && text[end - 1] === "\n") ? end - 1 : end;
  const to = text.indexOf("\n", last);
  return { from, to: (to === -1) ? text.length : to };
}

// The prefixes of lines that the line buttons switch between: a line has at most one of them
const linePrefixes = /^(#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+\. )/;

// Puts a prefix before each of the selected lines (e.g. "- " for a list), replacing another one they
// have, or takes it away if they all have it. Numbered lists count up.
export function linePrefix(edit: Edit, prefix: "- " | "1. " | "- [ ] " | "> " | "# " | "## " | "### "): Edit {
  const { text, start, end } = edit;
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const same = (prefix === "1. ") ? /^\d+\. / : (prefix === "- [ ] ") ? /^[-*+] \[[ xX]\] / : new RegExp("^" + prefix.replace(/[[\]*+.]/g, "\\$&"));
  const all = lines.every((line) => same.test(line));

  const changed = lines.map((line, i) => {
    const rest = line.replace(linePrefixes, "");
    if (all) {
      return rest;
    }
    return ((prefix === "1. ") ? `${i + 1}. ` : prefix) + rest;
  });
  const result = changed.join("\n");
  const newText = text.slice(0, from) + result + text.slice(to);
  if (start === end) {
    // The cursor stays where it was in the line
    const shift = changed[0].length - lines[0].length;
    const pos = Math.max(from, start + shift);
    return { text: newText, start: pos, end: pos };
  }
  return { text: newText, start: from, end: from + result.length };
}

// Headings go from none to big and smaller, and back to none
export function heading(edit: Edit): Edit {
  const { text, start } = edit;
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const level = (text.slice(from).match(/^(#{1,6}) /)?.[1].length) ?? 0;
  if (level >= 3) {
    return linePrefix(edit, "### ");
  }
  return linePrefix(edit, ["# ", "## ", "### "][level] as "# " | "## " | "### ");
}

// Code: within a line it's marked with backticks, several lines become a block
export function code(edit: Edit): Edit {
  const { text, start, end } = edit;
  const selected = text.slice(start, end);
  if (!selected.includes("\n")) {
    return wrap(edit, "`", "code");
  }
  const block = selected.match(/^```\n([\s\S]*)\n```$/);
  if (block) {
    return { text: text.slice(0, start) + block[1] + text.slice(end), start, end: start + block[1].length };
  }
  const result = "```\n" + selected + "\n```";
  return { text: text.slice(0, start) + result + text.slice(end), start, end: start + result.length };
}

// A link: the selection becomes its text, and the address is selected to be typed in
export function link(edit: Edit): Edit {
  const { text, start, end } = edit;
  const label = text.slice(start, end) || "text";
  const result = `[${label}](https://)`;
  const urlStart = start + label.length + 3;
  return {
    text: text.slice(0, start) + result + text.slice(end),
    // An empty selection selects the text to type it in, otherwise the address
    start: (start === end) ? start + 1 : urlStart,
    end: (start === end) ? start + 1 + label.length : urlStart + "https://".length,
  };
}
