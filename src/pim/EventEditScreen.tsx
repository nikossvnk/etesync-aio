// SPDX-FileCopyrightText: © 2017 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from "react";
import { ScrollView, View } from "react-native";
import { HelperText, Text } from "react-native-paper";
import { useDispatch } from "react-redux";
import { RouteProp, useNavigation } from "@react-navigation/native";
import * as ICAL from "ical.js";
import * as uuid from "uuid";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { pushMessage } from "../store/actions";
import { RootStackParamList } from "../RootStackParamList";
import { goUp } from "../navigation";
import LoadingIndicator from "../widgets/LoadingIndicator";
import NotFound from "../widgets/NotFound";
import Checkbox from "../widgets/Checkbox";
import ConfirmationDialog from "../widgets/ConfirmationDialog";
import AppbarAction from "../widgets/AppbarAction";
import { useTheme } from "../theme";
import * as C from "../constants";
import { EventType, timezoneLoadFromName } from "./pim-types";
import AttendeesField, { AttendeeEntry, attendeesOf, setAttendees } from "./AttendeesField";
import { deletePimItem, savePimItem, usePimCollections, usePimItems } from "./data";
import { TimezonePicker, timezoneName } from "./widgets";
import { useDateFormats } from "./format";
import { sameDay } from "./occurrences";
import { RepeatChoiceDialog } from "./Dialogs";
import { addSeconds, bumpSequence, changeOccurrence, excludeOccurrence, findOccurrence, hasChangedTimes, moveTime, updateSeries } from "./recurrence";
import { AccentButton, applyRepeat, CollectionPicker, DateTimeInput, Field, FieldInput, fromDateTimeStrings, pimStyles, RepeatKey, repeatKeyOf, RepeatPicker, toDateString, toTimeString } from "./widgets";

interface PropsType {
  route: RouteProp<RootStackParamList, "EventEdit">;
}

function currentTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function loadZone(name: string) {
  return (name === "UTC") ? ICAL.Timezone.utcTimezone : timezoneLoadFromName(name);
}

// The time zone an event's times are in (e.g. "Europe/Berlin", or "UTC"), or undefined for one
// without (a "floating" time, the same on every device)
function zoneOf(time: ICAL.Time): string | undefined {
  const name = time.timezone ?? time.zone?.tzid;
  if (!name || (name === "floating")) {
    return undefined;
  }
  return (name === "Z" || name === "UTC") ? "UTC" : name;
}

// What the form has, to tell what was changed in it
interface FormValues {
  title: string;
  calendar?: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  location: string;
  repeat: RepeatKey;
  attendees: string;
  description: string;
}

export default function EventEditScreen(props: PropsType) {
  const { colUid, itemUid, occurrence, date, time, attendeeName, attendeeEmail } = props.route.params ?? {};
  // A new event starts at the hour that was chosen in the week or the day view, and lasts an hour
  const startHour = (time) ? parseInt(time) : 9;
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const theme = useTheme();
  const etebase = useCredentials()!;
  const syncGate = useSyncGate();
  const calendars = usePimCollections(C.calendarType);
  const fmt = useDateFormats();
  const events = usePimItems(etebase, C.calendarType, EventType.parse);
  const existing = (itemUid) ? events?.find((x) => (x.itemUid === itemUid) && (x.collectionUid === colUid)) : undefined;
  // A repeating event opened at one of its times (from the calendar) shows that time, which can then be
  // changed on its own
  const rid = React.useMemo(() => (existing) ? findOccurrence(existing, occurrence) : undefined, [existing, occurrence]);

  const [loaded, setLoaded] = React.useState(false);
  const [title, setTitle] = React.useState(props.route.params?.title ?? "");
  const [calendar, setCalendar] = React.useState<string>();
  const [allDay, setAllDay] = React.useState(false);
  const [startDate, setStartDate] = React.useState(date ?? toDateString(new Date()));
  const [startTime, setStartTime] = React.useState(`${String(startHour).padStart(2, "0")}:00`);
  const [endDate, setEndDate] = React.useState(date ?? toDateString(new Date()));
  const [endTime, setEndTime] = React.useState(`${String(Math.min(startHour + 1, 23)).padStart(2, "0")}:${(startHour === 23) ? "59" : "00"}`);
  const [location, setLocation] = React.useState("");
  const [repeat, setRepeat] = React.useState<RepeatKey>("none");
  // Who's invited (from a contact's "Schedule", they are)
  const [attendees, setAttendeesState] = React.useState<AttendeeEntry[]>(() => (attendeeName) ? [{ name: attendeeName, email: attendeeEmail }] : []);
  // The time zone the times are in (the device's, unless the event is in another one)
  const [timezone, setTimezone] = React.useState(currentTimezone());
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [deleteShown, setDeleteShown] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // What the form had when it was opened, and the time of the event it showed
  const [initial, setInitial] = React.useState<FormValues>();
  const [shownStart, setShownStart] = React.useState<ICAL.Time>();
  // The times of a change to one time of a repeating event, while it's asked which times it's for
  const [choice, setChoice] = React.useState<{ start: ICAL.Time, end: ICAL.Time }>();

  // The form starts with what the event has, once it's loaded
  React.useEffect(() => {
    if (loaded || !events) {
      return;
    }
    if (existing) {
      // The time that was opened (which can have been changed on its own), or the event
      const details = (rid) ? existing.getOccurrenceDetails(rid) : undefined;
      const item = details?.item ?? existing;
      const startTime = details?.startDate ?? existing.startDate;
      const endTime = details?.endDate ?? existing.endDate ?? startTime;
      // The times as they are in the event's time zone (or on this device, for one without)
      const zone = (!startTime.isDate) ? zoneOf(startTime) : undefined;
      const known = !!zone && !!loadZone(zone);
      const wallClock = (time: ICAL.Time) => (known) ?
        new Date(time.year, time.month - 1, time.day, time.hour, time.minute) :
        time.convertToZone(ICAL.Timezone.localTimezone).toJSDate();
      const start = wallClock(startTime);
      let end = wallClock(endTime);
      if (startTime.isDate) {
        // All day events end at the start of the day after their last one
        end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      }
      const values: FormValues = {
        title: item.summary ?? "",
        calendar: existing.collectionUid,
        allDay: startTime.isDate,
        startDate: toDateString(start),
        startTime: toTimeString(start),
        endDate: toDateString(end),
        endTime: toTimeString(end),
        timezone: (known) ? zone! : timezone,
        location: item.location ?? "",
        repeat: repeatKeyOf(existing.isRecurring() ? existing.rrule : null),
        attendees: JSON.stringify(attendeesOf(item.component)),
        description: item.description ?? "",
      };
      setTitle(values.title);
      setCalendar(values.calendar);
      setAllDay(values.allDay);
      setStartDate(values.startDate);
      setStartTime(values.startTime);
      setEndDate(values.endDate);
      setEndTime(values.endTime);
      setTimezone(values.timezone);
      setLocation(values.location);
      setRepeat(values.repeat);
      setAttendeesState(JSON.parse(values.attendees));
      setDescription(values.description);
      setInitial(values);
      setShownStart(startTime);
    } else {
      setCalendar(colUid ?? calendars[0]?.colUid);
    }
    setLoaded(true);
  }, [events, existing, rid, loaded]);

  React.useEffect(() => {
    navigation.setOptions({
      title: (itemUid) ? "Edit Event" : "New Event",
      headerRight: () => (itemUid) ? (
        <View style={{ flexDirection: "row" }}>
          <AppbarAction icon="history" accessibilityLabel="History" onPress={() => navigation.navigate("ItemHistory", { colUid, itemUid })} />
          <AppbarAction icon="delete" accessibilityLabel="Delete" onPress={() => setDeleteShown(true)} />
        </View>
      ) : null,
    });
  }, [itemUid]);

  if (syncGate) {
    return syncGate;
  }
  if (!events || !loaded) {
    return <LoadingIndicator />;
  }
  if (itemUid && !existing) {
    return <NotFound />;
  }

  async function save() {
    if (!calendar) {
      setError("Choose a calendar");
      return;
    }
    const start = fromDateTimeStrings(startDate, (allDay) ? undefined : startTime);
    const end = fromDateTimeStrings(endDate, (allDay) ? undefined : endTime);
    if (!start || !end) {
      setError("The start and the end have to be valid dates and times");
      return;
    }

    // The times are in the chosen time zone (all day events have none)
    const zone = (!allDay) ? loadZone(timezone) : null;
    function toIcal(date: Date) {
      const data = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: 0 };
      if (allDay) {
        return ICAL.Time.fromData({ ...data, hour: 0, minute: 0, isDate: true });
      }
      return (zone) ? ICAL.Time.fromData({ ...data, isDate: false }, zone) : ICAL.Time.fromJSDate(date, false);
    }
    const icalStart = toIcal(start);
    const icalEnd = toIcal(end);
    if (allDay) {
      icalEnd.adjust(1, 0, 0, 0);
    }
    if (icalStart.compare(icalEnd) >= 0) {
      setError("The end has to be after the start");
      return;
    }

    // A change to one time of a repeating event can be for only that time, or for all of them (a
    // change to how it repeats, or to its calendar, is for all of them)
    if (existing && rid && existing.isRecurring() && (repeat === initial?.repeat) && (calendar === existing.collectionUid)) {
      setChoice({ start: icalStart, end: icalEnd });
      return;
    }
    await saveEvent(icalStart, icalEnd, "all");
  }

  async function saveEvent(icalStart: ICAL.Time, icalEnd: ICAL.Time, which: "this" | "all") {
    setChoice(undefined);
    // What was changed in the form (all of it, for a new event). Only that is changed in the event,
    // so the times of a repeating event that were changed on their own keep what they have.
    const values: FormValues = { title, calendar, allDay, startDate, startTime, endDate, endTime, timezone, location, repeat, attendees: JSON.stringify(attendees), description };
    const changed = (key: keyof FormValues) => !existing || !initial || (values[key] !== initial[key]);
    const timesChanged = (["allDay", "startDate", "startTime", "endDate", "endTime", "timezone"] as const).some(changed);
    const apply = (x: ICAL.Event) => {
      if (changed("title")) {
        x.summary = title;
      }
      if (changed("location")) {
        x.location = location;
      }
      if (changed("description")) {
        x.description = description;
      }
      if (changed("attendees")) {
        setAttendees(x.component, attendees);
      }
    };

    const event = existing?.clone() ?? new EventType();
    if (which === "this") {
      changeOccurrence(event, rid!, (x) => {
        apply(x);
        if (timesChanged) {
          x.startDate = icalStart;
          x.endDate = icalEnd;
        }
      });
    } else {
      if (!existing) {
        event.uid = uuid.v4();
      }
      apply(event);
      if (timesChanged || !existing) {
        if (rid && shownStart) {
          // The form had one of its times: all of them move as far as that one did
          const start = moveTime(existing!.startDate, shownStart, icalStart);
          event.startDate = start;
          event.endDate = addSeconds(start, icalEnd.subtractDate(icalStart).toSeconds());
        } else {
          event.startDate = icalStart;
          event.endDate = icalEnd;
        }
      }
      applyRepeat(event.component, repeat);
      if (existing) {
        // (its changed and cancelled times are kept with it)
        updateSeries(event, existing);
        bumpSequence(event.component);
      }
    }
    event.component.updatePropertyWithValue("last-modified", ICAL.Time.now());

    setSaving(true);
    try {
      await savePimItem(etebase, calendar!, event);
      dispatch(pushMessage({ message: (!existing) ? "Event created" : (which === "this") ? "This time of the event was saved" : "Event saved", severity: "success" }) as any);
      goUp(navigation, props.route);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(which: "this" | "all") {
    setDeleteShown(false);
    if (which === "this") {
      const event = existing!.clone();
      excludeOccurrence(event, rid!);
      event.component.updatePropertyWithValue("last-modified", ICAL.Time.now());
      await savePimItem(etebase, existing!.collectionUid!, event);
      dispatch(pushMessage({ message: "This time of the event was deleted", severity: "success" }) as any);
    } else {
      await deletePimItem(etebase, existing!);
      dispatch(pushMessage({ message: "Event deleted", severity: "success" }) as any);
    }
    goUp(navigation, props.route);
  }

  const repeating = !!existing?.isRecurring();
  const atTime = !!rid && repeating;

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={pimStyles.form}>
        <Field label="Title">
          <FieldInput autoFocus={!existing} value={title} onChangeText={setTitle} accessibilityLabel="Title" placeholder="Event title" />
        </Field>
        <Field label="Calendar">
          <CollectionPicker label="Calendar" collections={calendars} value={calendar} onChange={setCalendar} />
        </Field>
        <Checkbox title="All day" status={allDay} onPress={() => setAllDay(!allDay)} style={{ marginHorizontal: -16, marginBottom: 6 }} />
        <View style={pimStyles.row}>
          <Field label="Starts" style={{ flex: 1 }}>
            <DateTimeInput mode="date" value={startDate} onChange={(x) => {
              setStartDate(x);
              if (endDate < x) {
                setEndDate(x);
              }
            }} accessibilityLabel="Start date" />
          </Field>
          <Field label="Time" style={{ flex: 1 }}>
            <DateTimeInput mode="time" value={startTime} onChange={setStartTime} accessibilityLabel="Start time" disabled={allDay} />
          </Field>
        </View>
        <View style={pimStyles.row}>
          <Field label="Ends" style={{ flex: 1 }}>
            <DateTimeInput mode="date" value={endDate} onChange={setEndDate} accessibilityLabel="End date" />
          </Field>
          <Field label="Time" style={{ flex: 1 }}>
            <DateTimeInput mode="time" value={endTime} onChange={setEndTime} accessibilityLabel="End time" disabled={allDay} />
          </Field>
        </View>
        {!allDay && (
          <Field label="Time zone">
            <TimezonePicker value={timezone} onChange={setTimezone} />
            {(timezone !== currentTimezone()) && (() => {
              // The start, where the device is
              const start = fromDateTimeStrings(startDate, startTime);
              const zone = loadZone(timezone);
              if (!start || !zone) {
                return null;
              }
              const local = ICAL.Time.fromData({ year: start.getFullYear(), month: start.getMonth() + 1, day: start.getDate(), hour: start.getHours(), minute: start.getMinutes(), second: 0 }, zone).toJSDate();
              return (
                <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 6 }} testID="timezone-local">
                  Starts at {fmt.time(local)}{(sameDay(local, start)) ? "" : ` on ${fmt.day.format(local)}`} where you are ({timezoneName(currentTimezone())})
                </Text>
              );
            })()}
          </Field>
        )}
        {allDay && (
          <Field label="Time zone">
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }} testID="allday-timezone">
              None: an all day event is on the same dates in every time zone (like a birthday), also when you travel.
            </Text>
          </Field>
        )}
        <Field label="Repeat">
          <RepeatPicker value={repeat} onChange={setRepeat} />
        </Field>
        {repeating && (
          <Text style={{ color: theme.colors.textMuted, marginBottom: 14 }} testID="repeat-note">
            {(atTime) ?
              `This is the time on ${fmt.day.format(shownStart!.toJSDate())} of a repeating event. When you save, you choose whether the changes are for only this time or for all of them.` :
              "Changes to a repeating event change all of its times."}
          </Text>
        )}
        {repeating && (repeat !== initial?.repeat) && hasChangedTimes(existing!) && (
          <Text style={{ color: theme.colors.textMuted, marginBottom: 14 }}>
            When it repeats in another way, the times of it that were changed or deleted on their own are as the new rule makes them.
          </Text>
        )}
        <Field label="Attendees">
          <AttendeesField value={attendees} onChange={setAttendeesState} />
        </Field>
        <Field label="Location">
          <FieldInput value={location} onChangeText={setLocation} accessibilityLabel="Location" />
        </Field>
        <Field label="Description">
          <FieldInput value={description} onChangeText={setDescription} accessibilityLabel="Description" multiline style={{ minHeight: 90, textAlignVertical: "top" }} />
        </Field>
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <AccentButton label={(saving) ? "Saving…" : "Save"} disabled={saving} onPress={save} style={{ alignSelf: "flex-end" }} />
      </View>
      {(atTime) ? (deleteShown && (
        <RepeatChoiceDialog
          title="Delete a repeating event"
          message={`“${existing?.title || "(no title)"}” repeats. Delete only this time, or all of its times?`}
          danger
          onChoose={remove}
          onClose={() => setDeleteShown(false)}
        />
      )) : (
        <ConfirmationDialog
          title="Delete Event"
          visible={deleteShown}
          onOk={() => remove("all")}
          onCancel={() => setDeleteShown(false)}
        >
          <Text>Delete "{existing?.title}"?</Text>
        </ConfirmationDialog>
      )}
      {choice && (
        <RepeatChoiceDialog
          title="Save a repeating event"
          message={`“${title || "(no title)"}” repeats. Save the changes for only this time, or for all of its times?`}
          onChoose={(which) => saveEvent(choice.start, choice.end, which)}
          onClose={() => setChoice(undefined)}
        />
      )}
    </ScrollView>
  );
}
