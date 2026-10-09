import * as Etebase from "etebase";
import { strToU8, zipSync, Zippable } from "fflate";
import { Map as ImmutableMap } from "immutable";

import * as C from "../constants";
import { untitled } from "../notes";
import { newNotes } from "../newNotes";
import { StoreState } from "../store";
import { CachedItem } from "../store/reducers";

// A name that can be used for a file on any system: without the characters some of them don't allow,
// and not too long
export function fileName(name: string) {
  const ret = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 100)
    .trimEnd();
  return ret || untitled;
}

// The name with a number added if it's already taken (ignoring the case, as some systems do)
function uniqueName(taken: Set<string>, name: string, extension: string) {
  let ret = name + extension;
  for (let i = 2; taken.has(ret.toLowerCase()); i++) {
    ret = `${name} (${i})${extension}`;
  }
  taken.add(ret.toLowerCase());
  return ret;
}

// All of the notes on the device (including changes that weren't sent to the server yet), as a zip
// with a folder for every notebook and a Markdown file for every note in it, named after its title
export async function exportNotes(etebase: Etebase.Account, state: StoreState) {
  const colMgr = etebase.getCollectionManager();
  const files: Zippable = {};
  const folders = new Set<string>();
  let count = 0;

  const collections = state.cache.collections
    .filter((x) => x.collectionType === C.colType)
    .sortBy((x) => (x.meta.name ?? "").toLowerCase());
  for (const [colUid, cachedCol] of collections) {
    const col = colMgr.cacheLoad(cachedCol.cache);
    const itemMgr = colMgr.getItemManager(col);
    const folder: Zippable = {};
    const names = new Set<string>();
    const items = state.cache.items.get(colUid, ImmutableMap<string, CachedItem>())
      .filter((x) => !x.isDeleted)
      .sortBy((x) => x.meta.mtime ?? 0);
    for (const [itemUid, cachedItem] of items) {
      const item = itemMgr.cacheLoad(cachedItem.cache);
      const content = await item.getContent(Etebase.OutputFormat.String);
      // A new note that is still empty isn't a note yet
      if (newNotes.has(itemUid) && !content && !cachedItem.meta.name) {
        continue;
      }
      const name = uniqueName(names, fileName(cachedItem.meta.name || untitled), ".md");
      const mtime = cachedItem.meta.mtime;
      folder[name] = [strToU8(content), (mtime) ? { mtime: new Date(mtime) } : {}];
      count++;
    }
    files[uniqueName(folders, fileName(cachedCol.meta.name || untitled), "")] = folder;
  }

  return { data: zipSync(files), count };
}
