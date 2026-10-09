# EteSync all-in-one (proof of concept)

One app for notes, calendar, tasks and contacts on EteSync (Etebase), made from
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
- **New** are the Calendar, Tasks and Contacts screens, made with the components and theme of the
  notes, in the sidebar (wide screens) and the drawer (phones).

## What's in it

| | |
|---|---|
| Sidebar | The account, one search for notes, events, tasks and contacts, and a "+" to make any of them. The four sections as equals, with live counts (notes, events today, tasks due). Under them a list about the open section: notebooks, calendars to show and hide (and the birthdays of contacts), task lists, address books and contact groups. Settings, the sync state and hiding the sidebar on one row. |
| Calendar | Day, week, month and agenda views (weeks start on Monday or Sunday, by the setting). The month: weekends apart, events with a time as a dot and the time, all day ones as bars joining over their days; the chosen day's events next to it (place, who comes) and what's coming up. The week: the hours of seven days, the chosen event's details next to it. The day: the hours with each event's place and who comes, a small month to go to another day, and the tasks due that day. The agenda: the next four weeks by day, the next event marked, repeating events hidden unless asked for. Events can be dragged to another time (and day), and their lower edge to change when they end. Choosing an empty hour makes an event then. |
| Tasks | Adding from the top, the tasks in Overdue, Today, Upcoming and No date, today's progress. Each shows its list, its subtasks, a flag when it's important, and when it's due. Next to them on wide screens the chosen task's details: due, repeat, list, priority, its subtasks to tick off and add, and its notes. Repeating tasks get their next time when done. An editor for all of it. |
| Contacts | A to Z, by address book or group. A contact's details, with buttons to email, call, schedule an event with them (they're invited) and edit, and what's about them: the events with them (and their birthday), the notes and the open tasks that mention them. |
| Collections | New calendars, task lists and address books. The wizard makes the missing ones for new accounts. |
| Login, signup, account | The notes' screens, which do what the web app's do (the same Etebase calls and checks). |
| Settings | One screen: the notes' settings, and "Calendar and Tasks" with the settings of the web app. The web app's dark mode setting is the notes' theme setting. |

## How it fits together

- `src/store/construct.ts`: everything that is synced is in `allCache`. The notes' code keeps using
  `cache`, which is now a view of only the notebooks, so it didn't have to change.
- `src/sync/SyncManager.ts`: syncs the four collection types instead of one. A conflict on an
  event, task or contact keeps the server's version (a "conflict copy", like notes get, would be a
  second event with the same UID).
- `src/pim/`: the new screens, `data.ts` (reading and saving items through the notes' offline
  queue) and the model from etesync-web.

## Running it

```
npm install
npx expo start --web                         # development
npx expo export -p web --output-dir web-build  # a build, e.g. served by e2e/serve.js
```

## Tests

`e2e/tests/pim.js` (with the rest of the notes' browser tests, see `e2e/README.md`) makes a new
account on the test server, goes through the wizard, and checks that events, tasks and contacts
from the server show up, and that the ones made or changed in the app get to the server.

## Not done (it's a proof of concept)

- Editing repeating events changes all of their times (no "only this one"), and their repeat rule
  can't be changed in the app yet (it's kept as it is).
- Contacts: only the first phone number and email are edited (the others are kept); no groups,
  photos or addresses in the editor. No import of .ics or .vcf files.
- Sharing calendars (members, invitations) uses what the notes have, which is made for notebooks.
- Reminders, time zones other than the device's for new events, linking notes to events and tasks,
  favourite contacts, a board view of the tasks (the designs have them, the data has nothing for them yet).
- Dragging a repeating event moves all of its times (and only to another time of the same day).
- An existing etesync-notes install that is moved to this app has to sync all collections once from
  the start (its sync token only covers notebooks). A new install doesn't have this.
- Licenses: etesync-notes is GPL-3.0 and etesync-web is AGPL-3.0. Files taken from etesync-web keep
  their AGPL-3.0 notice, and the combination has to follow the AGPL.
