// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import * as Etebase from "etebase";
import MiniSearch, { Options, SearchResult } from "minisearch";
import { useSelector } from "react-redux";

import { useCredentials } from "./credentials";
import { untitled } from "./notes";
import { StoreState } from "./store";

type NoteData = { name: string, content: string, id: string };

const msOptions: Options = {
  fields: ["name", "content"],
  storeFields: ["name", "content"],
  searchOptions: {
    boost: { name: 2 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: "AND",
  },
};

// Searches the titles and contents of all of the notes. The results have the note as id
// ("colUid:itemUid"), and its name and content.
export function useNoteSearch(query: string, enabled = true) {
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const cacheItems = useSelector((state: StoreState) => state.cache.items);
  const etebase = useCredentials();
  const minisearch = React.useMemo(() => new MiniSearch<NoteData>(msOptions), []);
  // Changes when the notes were indexed again, so that the results follow
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    if (!enabled || !etebase) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const notesList: NoteData[] = [];
      const colMgr = etebase.getCollectionManager();

      for (const [colUid, itemsList] of cacheItems.entries()) {
        const cachedCol = cacheCollections.get(colUid);
        if (!cachedCol) {
          continue;
        }
        const itemMgr = colMgr.getItemManager(colMgr.cacheLoad(cachedCol.cache));

        for (const [uid, cachedItem] of itemsList.entries()) {
          if (cachedItem.isDeleted) {
            continue;
          }
          const item = itemMgr.cacheLoad(cachedItem.cache);
          // FIXME We need to remove the markdown formatting and the repeated new lines to have nicer results
          const content = await item.getContent(Etebase.OutputFormat.String);

          notesList.push({ name: cachedItem.meta.name || untitled, content, id: `${colUid}:${uid}` });
        }
      }
      if (!cancelled) {
        minisearch.removeAll();
        minisearch.addAll(notesList);
        setVersion((x) => x + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, etebase, cacheCollections, cacheItems]);

  return React.useMemo(() => (
    (query && minisearch.documentCount > 0) ? minisearch.search(query) : []
  ), [query, version]) as SearchResult[];
}
