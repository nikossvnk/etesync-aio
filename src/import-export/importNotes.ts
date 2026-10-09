import * as Etebase from "etebase";
import { strFromU8, unzipSync } from "fflate";

import * as C from "../constants";
import { StoreState } from "../store";
import { saveCollectionLocally, saveItemsLocally } from "../sync/SyncManager";

export type ImportedNote = { notebook: string, name: string, content: string };

// The notebook of the files that aren't in a folder
export const defaultImportNotebook = "Imported";

// The notes in a zip as the export makes it: a folder for every notebook, with a Markdown file for
// every note in it, named after its title. Other files are left out (and files in folders in the
// notebooks' folders are in the notebook of the folder they're in).
export function readNotesZip(data: Uint8Array): ImportedNote[] {
  const files = unzipSync(data, {
    filter: (file) => /\.md$/i.test(file.name) && !file.name.startsWith("__MACOSX/"),
  });
  const ret: ImportedNote[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    const parts = path.split("/").filter((x) => x !== "");
    const file = parts[parts.length - 1];
    if (!file || file.startsWith(".")) {
      continue;
    }
    ret.push({
      notebook: (parts.length > 1) ? parts[0] : defaultImportNotebook,
      name: file.replace(/\.md$/i, ""),
      // (without the byte order mark some editors put in front)
      content: strFromU8(bytes).replace(/^\uFEFF/, ""),
    });
  }
  return ret.sort((a, b) => (a.notebook + "/" + a.name).localeCompare(b.notebook + "/" + b.name));
}

// Adds the notes to the notebooks with their names, creating the notebooks that aren't there. Notes
// that are there already, with the same title and content, are skipped, so importing an export again
// doesn't add them twice. They're saved on the device, and uploaded.
export async function importNotes(etebase: Etebase.Account, state: StoreState, notes: ImportedNote[]) {
  const colMgr = etebase.getCollectionManager();
  let imported = 0;
  let skipped = 0;
  let notebooksCreated = 0;

  const byNotebook = new Map<string, ImportedNote[]>();
  for (const note of notes) {
    byNotebook.set(note.notebook, [...(byNotebook.get(note.notebook) ?? []), note]);
  }

  for (const [notebook, notebookNotes] of byNotebook) {
    // The notebook with that name, or a new one
    const existing = Array.from(state.cache.collections.entries())
      .find(([_uid, x]) => (x.collectionType === C.colType) && (x.meta.name === notebook));
    let col: Etebase.Collection;
    const known = new Set<string>();
    if (existing) {
      col = colMgr.cacheLoad(existing[1].cache);
      const itemMgr = colMgr.getItemManager(col);
      for (const cachedItem of (state.cache.items.get(existing[0])?.values() ?? [])) {
        if (!cachedItem.isDeleted) {
          const content = await itemMgr.cacheLoad(cachedItem.cache).getContent(Etebase.OutputFormat.String);
          known.add(`${cachedItem.meta.name}\n${content}`);
        }
      }
    } else {
      col = await colMgr.create(C.colType, { name: notebook, mtime: (new Date()).getTime() }, "");
      await saveCollectionLocally(etebase, colMgr, col, true);
      notebooksCreated++;
    }

    const itemMgr = colMgr.getItemManager(col);
    const items: Etebase.Item[] = [];
    for (const note of notebookNotes) {
      const key = `${note.name}\n${note.content}`;
      if (known.has(key)) {
        skipped++;
        continue;
      }
      known.add(key);
      items.push(await itemMgr.create({ name: note.name, mtime: (new Date()).getTime() }, note.content));
    }
    if (items.length > 0) {
      await saveItemsLocally(etebase, col, itemMgr, items);
      imported += items.length;
    }
  }

  return { imported, skipped, notebooksCreated };
}
