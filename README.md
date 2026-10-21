# EteSync all-in-one (proof of concept)

One app for notes, bookmarks, calendar, tasks and contacts on EteSync (Etebase), made from
[etesync-notes](../etesync-notes) and [etesync-web](../etesync-web). It's a copy: the two projects
themselves are not changed.

- **The base is etesync-notes**: its UI (react-native-paper, the sidebar, the theme), its offline-first
  sync (changes are kept on the device and pushed later, conflicts are resolved) and its screens.
  It's still a React Native app, so it builds for the web and, in principle, for Android and iOS.
- **From etesync-web** comes the logic, not the UI: the calendar, task and contact model
  (`src/pim/pim-types.ts`, iCalendar and vCard through ical.js, with the time zones), how items are
  made and changed (UIDs, all day events ending on the next day, repeating tasks getting their next
  time when done, …), the first run wizard that makes a calendar, a task list and an address book,
  and its settings (date and time format, task sorting).
- **From etesync-notes' Android app** come the bookmarks (`src/bookmarks.ts`): the same collection
  type (`etebase.bookmark`) and data, so the bookmarks saved on the phone are the ones here.
- **New** are the Bookmarks, Calendar, Tasks and Contacts screens, made with the components and theme of the
  notes, in the sidebar (wide screens) and the drawer (phones).

## What's in it

| | |
|---|---|
| Sidebar | The account, one search for notes, events, tasks and contacts, and a "+" to make any of them (and a bookmark). The five sections as equals, with live counts (notes, bookmarks, events today, tasks due). Under them a list about the open section: notebooks, bookmark lists, calendars to show and hide (and the birthdays of contacts), task lists, address books and contact groups. Settings, the sync state and hiding the sidebar on one row. |
| Notes | The notes column next to the sidebar (on phones the list), with the notebook's notes or all of them. Pinned notes are shown above the others, as cards two per row (an odd last one as wide as the row, with the beginning of the note), under a "Pinned" title that folds them away, and the others under "Other notes". Notes are pinned with the pin in the bar of the open note, or several at once: selected with ctrl-click (a long press on phones), then "Pin selected". The pin is in the note's (encrypted) metadata, the same as in EteSync Notes, and pinning doesn't change when the note was modified. |
| Bookmarks | A link is saved by pasting it in the bar at the top and pressing Enter (or dropping it from the browser): it's saved right away (shown by its site until it has a title, which can be read from the page with "Get title", see below). The list: each bookmark's site (as a letter), title, site and note, tags and when it was saved, with buttons to open it in the browser and to delete it; search, sorting (newest, oldest, title, site) and the tags to filter by. Ticked bookmarks can be moved to another list, tagged or deleted together. Next to the list the chosen one is edited (link, title, note, tags, list; open, copy the link, delete), with when and where it was saved (on Android, shared to the Android app, on a computer, or imported), and "New bookmark" opens it empty. Deleting shows an Undo message instead of asking. The lists are in the sidebar, with "All bookmarks". |
| Calendar | Day, week, month and agenda views (weeks start on Monday or Sunday, by the setting). The month: weekends apart, events with a time as a dot and the time, all day ones as bars joining over their days; the chosen day's events next to it (place, who comes) and what's coming up. Events of several days are bars over their days (on lines of their own when they overlap, with an arrow where they go on into the next week). The week: the hours of seven days, the all day events as bars over them, the chosen event's details next to it. The day: the hours with each event's place and who comes, a small month to go to another day, and the tasks due that day. The agenda: the next four weeks by day, the next event marked, repeating events hidden unless asked for. Events can be dragged to another time (and day), and their lower edge to change when they end. Events have a time zone (like in the web app): their times are in it, and the editor says when they are where you are. Who's invited (the event's attendees) is shown. Choosing an empty hour makes an event then. |
| Tasks | Adding from the top, the tasks in Overdue, Today, Upcoming and No date, today's progress. Each shows its list, its subtasks, a flag when it's important, and when it's due. Next to them on wide screens the chosen task's details: due, repeat, list, priority, its subtasks to tick off and add, and its notes. Repeating tasks get their next time when done. An editor for all of it. |
| Contacts | A to Z, by address book or group. A contact's details, with buttons to email, call, schedule an event with them (they're invited) and edit, and what's about them: the events with them (and their birthday), the notes and the open tasks that mention them. |
| Collections | Like the web app's Collections and Import pages. The + of each section of the sidebar makes a calendar, task list, address book, notebook or bookmark list (name, description, colour); the ⋯ of each has its colour, editing, sharing, showing only it, exporting (.ics, .vcf, .md, and .html for bookmarks, which browsers can import), importing into it and deleting. Settings → Collections lists them all, with how much is in them, who they're shared with and when they changed, and edits the chosen one: its details, who has access (invitations by username, after checking their security fingerprint; changing and removing access), its changes, and deleting it (or leaving one shared with you). Importing: .ics (events and tasks), .vcf (contacts), .md or .txt files (a note each) and .html bookmark files exported from Chrome, Firefox and other browsers (the folders the bookmarks were in become their tags) are read on the device; what's in them can go to existing or new collections, what's there already (by its UID, or the link for bookmarks) is skipped, updated or copied, and what can't be read is reported with its line. The wizard makes the missing collections for new accounts. |
| Login, signup, account | Do what the web app's do (the same Etebase calls and checks). On wide screens a card under a bar with the help links and the settings, on phones the menu. The server is shown, and changed only when asked to. Signing up shows how strong the password is, and needs agreeing that it can't be recovered. |
| Settings | One screen: the notes' settings, and "Calendar and Tasks" with the settings of the web app. The web app's dark mode setting is the notes' theme setting. |

## How it fits together

- `src/store/construct.ts`: everything that is synced is in `allCache`. The notes' code keeps using
  `cache`, which is now a view of only the notebooks, so it didn't have to change.
- `src/sync/SyncManager.ts`: syncs the five collection types instead of one. When the types it
  syncs change (e.g. an update brings a new one), all collections are listed again, so the older ones
  of the new type are found too. A conflict on an event, task, contact or bookmark keeps the server's version (a "conflict copy", like notes get, would be a
  second event with the same UID). A note changed here and elsewhere gets a conflict copy only when
  its name or content was changed here (the revision the change was made to is looked up to tell),
  and a pin made here is kept on the version from elsewhere, as in EteSync Notes.
- `src/pim/`: the new screens, `data.ts` (reading and saving items through the notes' offline
  queue) and the model from etesync-web.

## Security and privacy

- **End-to-end encrypted.** Notes, events, tasks and contacts are encrypted on the device (by Etebase)
  before they're sent, and decrypted on the device after they're received. `e2e/tests/privacy.js`
  checks this on the real traffic: while a note, an event, a task and a contact are made, nothing of
  them, nor the password (which is never sent, the login proves it without), nor which kinds of
  collections there are, is in anything sent to or received from the server, while the server does
  have them (readable only with the account's keys). The app talks to no other host, except when
  a bookmark is saved (see below).
- **Titles of bookmarks.** Only when "Get title" (under a bookmark's link) is pressed, its page is
  fetched to read its title, like in EteSync Notes. Browsers don't let the app
  read other sites, so the local web server (`desktop/serve.py`) does it, on this computer: it
  fetches the page directly from the site (not through the Etebase server), and gives the app only
  the title. The site sees this computer's address, like when the link is opened, but no cookies or
  where it came from. Only the app can ask for it (it has to send a header that other sites can't),
  and only for web links. Without the local server (e.g. `npx expo start`) there's no title, and the
  site's name is shown. Nothing is fetched otherwise: not when a link is saved, nor when bookmarks
  are listed, edited, synced or imported.
- **What stays on the computer.** The browser keeps the login and the synced data in its storage for
  the app's address, with the contents encrypted like on the server. Kept readable are only what
  the lists need: the titles of notes, the names of notebooks, calendars, task lists, address
  books and bookmark lists, and the bookmarks (their link, title, note and tags are their meta, as
  in EteSync Notes, so that they're listed without decrypting each one). Logging out removes all of it. A browser has no safe place for keys, so whoever can use the
  browser profile can use the account (see `desktop/README.md`).
- **Nothing in synced data runs as code.** Everything is shown as text (no HTML). Links from synced
  data (contacts' web sites, links in notes) are only opened when they are web, email or phone links.
  The local web server sends a Content-Security-Policy that only lets the app's own code run, keeps
  it out of frames, and only answers requests for `localhost` (against DNS rebinding).
- **Items that can't be read** (e.g. written by another app in a way this one doesn't know) are left
  out with a message. What's in them isn't shown or logged, and they don't stop the app
  (`e2e/tests/unreadable.js`).
- **The server's address** has to start with `https://`, except for servers on the local network.
- **Dependencies:** `npm audit` reports issues in the build tools (Expo's and React Native's command
  line tools, Metro), which run when building and aren't part of the app. Fixing them needs major
  upgrades of Expo.

## Installing it

On Linux, with Python 3 (see `desktop/README.md`, also for running it without installing):

```
curl -fsSL https://raw.githubusercontent.com/nikossvnk/etesync-aio/main/desktop/get.sh | sh
```

It installs the latest release, the built app, from this repository's GitHub releases, which the
release workflow makes for each tag.

## Running it

```
npm install
npx expo start --web                         # development
npx expo export -p web --output-dir web-build  # a build, e.g. served by e2e/serve.js
```

## Tests

`e2e/tests/pinned-notes.js` checks pinning notes on phones and wide screens (on the server: the pin,
that the modification time stays, unpinning, another device, pinning offline while the note is
changed elsewhere), the cards, and folding them away.
`e2e/tests/bookmarks.js` checks the bookmarks on wide screens (saving a pasted link, "Get title" and that nothing else contacts the page, where it was saved,
editing, tags, moving, deleting with undo, importing and exporting a browser's bookmark file).
`e2e/tests/pim.js` (with the rest of the notes' browser tests, see `e2e/README.md`) makes a new
account on the test server, goes through the wizard, and checks that events, tasks and contacts
from the server show up, and that the ones made or changed in the app get to the server.

## Not done (it's a proof of concept)

- Editing repeating events changes all of their times (no "only this one"), and their repeat rule
  can't be changed in the app yet (it's kept as it is).
- Contacts: only the first phone number and email are edited (the others are kept); no groups,
  photos or addresses in the editor.
- The changes of a collection list its items, but not the earlier versions of each (the web app has
  those).
- Sharing calendars (members, invitations) uses what the notes have, which is made for notebooks.
- Reminders, linking notes to events and tasks,
  favourite contacts, a board view of the tasks (the designs have them, the data has nothing for them yet).
- Dragging a repeating event moves all of its times (and only to another time of the same day).
- Where a bookmark was saved: this app records it ("on a computer", or "imported"), but EteSync Notes
  on Android doesn't yet, so the ones saved there don't say. It also drops it when one is edited there.
- Licenses: etesync-notes is GPL-3.0 and etesync-web is AGPL-3.0. Files taken from etesync-web keep
  their AGPL-3.0 notice, and the combination has to follow the AGPL.
