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
import * as C from "../constants";
import { TaskStatusType, TaskType } from "./pim-types";
import { priorityName } from "./TasksScreen";
import { useTheme } from "../theme";
import { deletePimItem, savePimItem, usePimCollections, usePimItems } from "./data";
import { updateSeries } from "./recurrence";
import { Reminder, reminderKey, remindersOf, setReminders } from "./reminders";
import { AccentButton, applyRepeat, CollectionPicker, DateTimeInput, Field, FieldInput, fromDateTimeStrings, pimStyles, ReminderPicker, RepeatKey, repeatKeyOf, RepeatPicker, toDateString } from "./widgets";

interface PropsType {
  route: RouteProp<RootStackParamList, "TaskEdit">;
}

export default function TaskEditScreen(props: PropsType) {
  const { colUid, itemUid } = props.route.params ?? {};
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const etebase = useCredentials()!;
  const theme = useTheme();
  const syncGate = useSyncGate();
  const lists = usePimCollections(C.tasksType);
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);
  const existing = (itemUid) ? tasks?.find((x) => (x.itemUid === itemUid) && (x.collectionUid === colUid)) : undefined;

  const [loaded, setLoaded] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [list, setList] = React.useState<string>();
  const [due, setDue] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState("None");
  const [repeat, setRepeat] = React.useState<RepeatKey>("none");
  const [reminders, setRemindersState] = React.useState<Reminder[]>([]);
  const [error, setError] = React.useState<string>();
  const [deleteShown, setDeleteShown] = React.useState(false);

  React.useEffect(() => {
    if (loaded || !tasks) {
      return;
    }
    if (existing) {
      setTitle(existing.title ?? "");
      setList(existing.collectionUid);
      setDue((existing.dueDate) ? toDateString(existing.dueDate.toJSDate()) : "");
      setDone(existing.finished);
      setDescription(existing.description ?? "");
      setPriority(priorityName(existing));
      setRepeat(repeatKeyOf(existing.isRecurring() ? existing.rrule : null));
      setRemindersState(remindersOf(existing.component));
    } else {
      setList(colUid ?? lists[0]?.colUid);
    }
    setLoaded(true);
  }, [tasks, existing, loaded]);

  React.useEffect(() => {
    navigation.setOptions({
      title: (itemUid) ? "Edit Task" : "New Task",
      headerRight: () => (itemUid) ? (
        <AppbarAction icon="delete" accessibilityLabel="Delete" onPress={() => setDeleteShown(true)} />
      ) : null,
    });
  }, [itemUid]);

  if (syncGate) {
    return syncGate;
  }
  if (!tasks || !loaded) {
    return <LoadingIndicator />;
  }
  if (itemUid && !existing) {
    return <NotFound />;
  }

  async function save() {
    if (!list) {
      setError("Choose a task list");
      return;
    }
    let dueDate: ICAL.Time | undefined;
    if (due.trim()) {
      const date = fromDateTimeStrings(due);
      if (!date) {
        setError("The due date has to be a valid date");
        return;
      }
      // Only the day is chosen here, so keep the time of a due date that has one
      if (existing?.dueDate && !existing.dueDate.isDate) {
        dueDate = existing.dueDate.clone();
        dueDate.year = date.getFullYear();
        dueDate.month = date.getMonth() + 1;
        dueDate.day = date.getDate();
      } else {
        dueDate = ICAL.Time.fromData({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), isDate: true });
      }
    }

    const task = existing?.clone() ?? new TaskType(null);
    if (existing) {
      task.collectionUid = existing.collectionUid;
      task.itemUid = existing.itemUid;
    } else {
      task.uid = uuid.v4();
    }
    task.title = title;
    task.dueDate = dueDate;
    task.description = description;
    if (priority !== priorityName(task)) {
      const values: { [name: string]: number } = { High: 1, Medium: 5, Low: 9 };
      if (values[priority]) {
        task.priority = values[priority] as any;
      } else {
        task.component.removeAllProperties("priority");
      }
    }
    if (done !== existing?.finished) {
      task.status = (done) ? TaskStatusType.Completed : TaskStatusType.NeedsAction;
      task.completionDate = (done) ? ICAL.Time.now() : undefined;
    }
    if ((repeat !== "none") && (repeat !== "custom") && !dueDate) {
      setError("A task that repeats needs a due date");
      return;
    }
    applyRepeat(task.component, repeat);
    if ((reminders.length > 0) && !dueDate && !task.startDate) {
      setError("A task with reminders needs a due date");
      return;
    }
    // (only when they were changed, so ones another app made relative to something else stay)
    if (!existing || (reminders.map(reminderKey).join("\n") !== remindersOf(existing.component).map(reminderKey).join("\n")) || (!!existing.dueDate !== !!dueDate)) {
      setReminders(task.component, reminders);
    }
    if (existing) {
      // (the times of a repeating task that were changed or cancelled on their own are kept with it)
      updateSeries(task, existing);
    }
    task.lastModified = ICAL.Time.now();

    try {
      await savePimItem(etebase, list, task);
      dispatch(pushMessage({ message: (existing) ? "Task saved" : "Task created", severity: "success" }) as any);
      goUp(navigation, props.route);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove() {
    setDeleteShown(false);
    await deletePimItem(etebase, existing!);
    dispatch(pushMessage({ message: "Task deleted", severity: "success" }) as any);
    goUp(navigation, props.route);
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={pimStyles.form}>
        <Field label="Title">
          <FieldInput autoFocus={!existing} value={title} onChangeText={setTitle} accessibilityLabel="Title" placeholder="Task title" />
        </Field>
        <Field label="Task list">
          <CollectionPicker label="Task list" collections={lists} value={list} onChange={setList} />
        </Field>
        <Field label="Due">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <DateTimeInput mode="date" value={due} onChange={setDue} accessibilityLabel="Due date" />
            {!!due && <Text onPress={() => setDue("")} style={{ textDecorationLine: "underline" }}>Clear</Text>}
          </View>
        </Field>
        <Field label="Reminders">
          <ReminderPicker value={reminders} onChange={setRemindersState} allDay={!existing?.dueDate || existing.dueDate.isDate} isTask />
        </Field>
        <Field label="Repeat">
          <RepeatPicker value={repeat} onChange={setRepeat} />
        </Field>
        <Field label="Priority">
          <View style={{ flexDirection: "row", gap: 6 }}>
            {["None", "Low", "Medium", "High"].map((x) => (
              <Text
                key={x}
                accessibilityRole="button"
                accessibilityLabel={`Priority ${x}`}
                aria-selected={priority === x}
                onPress={() => setPriority(x)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, overflow: "hidden",
                  borderColor: (priority === x) ? theme.colors.chipActive : theme.colors.border,
                  backgroundColor: (priority === x) ? theme.colors.chipActive : theme.colors.surface,
                  color: (priority === x) ? theme.colors.onChipActive : theme.colors.textBody }}
              >
                {x}
              </Text>
            ))}
          </View>
        </Field>
        <Checkbox title="Done" status={done} onPress={() => setDone(!done)} style={{ marginHorizontal: -16, marginBottom: 6 }} />
        <Field label="Notes">
          <FieldInput value={description} onChangeText={setDescription} accessibilityLabel="Notes" multiline style={{ minHeight: 90, textAlignVertical: "top" }} />
        </Field>
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <AccentButton label="Save" onPress={save} style={{ alignSelf: "flex-end" }} />
      </View>
      <ConfirmationDialog
        title="Delete Task"
        visible={deleteShown}
        onOk={remove}
        onCancel={() => setDeleteShown(false)}
      >
        <Text>Delete "{existing?.title}"?</Text>
      </ConfirmationDialog>
    </ScrollView>
  );
}
