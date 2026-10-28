// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { IconButton, Text, TouchableRipple } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import * as ICAL from "ical.js";
import * as uuid from "uuid";

import { useCredentials } from "../credentials";
import { useSyncGate } from "../SyncGate";
import { pushMessage, setSettings } from "../store/actions";
import { StoreState, TaskSettingsType } from "../store";
import LoadingIndicator from "../widgets/LoadingIndicator";
import { fonts, useTheme } from "../theme";
import * as C from "../constants";
import { TaskStatusType, TaskType, utcNow } from "./pim-types";
import { PimCollection, savePimItem, usePimCollections, usePimItems } from "./data";
import { AccentButton, EmptyState } from "./widgets";
import { DateFormats, useDateFormats } from "./format";
import { useDialogs } from "./Dialogs";
import { addDays, sameDay, startOfDay } from "./occurrences";
import { mono } from "./style";
import { reminderLabel, remindersOf } from "./reminders";
import { panelStyle, SmallButton } from "./CalendarParts";

export function formatDue(task: TaskType, fmt: DateFormats) {
  const due = task.dueDate;
  if (!due) {
    return undefined;
  }
  const date = due.toJSDate();
  if (sameDay(date, new Date()) && !due.isDate) {
    return fmt.time(date);
  }
  return fmt.shortDate(date) + ((due.isDate) ? "" : ` ${fmt.time(date)}`);
}

// Priorities 1-4 are high, 5 medium, 6-9 low (0 or none: none)
export function priorityName(task: TaskType) {
  const p = Number(task.priority ?? 0);
  return (p >= 1 && p <= 4) ? "High" : (p === 5) ? "Medium" : (p >= 6 && p <= 9) ? "Low" : "None";
}

// How a repeat rule reads, e.g. "Every week" or "Every 2 days"
export function repeatName(rule: ICAL.Recur | undefined | null) {
  if (!rule) {
    return "Doesn't repeat";
  }
  const units: { [freq: string]: string } = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" };
  const json = (rule as any).toJSON?.() ?? {};
  const unit = units[json.freq] ?? json.freq?.toLowerCase();
  const interval = json.interval ?? 1;
  return (interval > 1) ? `Every ${interval} ${unit}s` : `Every ${unit}`;
}

// Marks a task as done (or not done). Repeating tasks get their next time as a new task, like in the
// web app.
export async function setTaskDone(etebase: Parameters<typeof savePimItem>[0], task: TaskType, done: boolean) {
  const changed = task.clone();
  changed.collectionUid = task.collectionUid;
  changed.itemUid = task.itemUid;
  changed.status = (done) ? TaskStatusType.Completed : TaskStatusType.NeedsAction;
  changed.completionDate = (done) ? utcNow() : undefined;
  changed.lastModified = utcNow();
  await savePimItem(etebase, task.collectionUid!, changed);

  const next = (done) ? task.getNextOccurence() : null;
  if (next) {
    await savePimItem(etebase, task.collectionUid!, next);
  }
  return next;
}

async function addTask(etebase: Parameters<typeof savePimItem>[0], colUid: string, title: string, parent?: TaskType) {
  const task = new TaskType(null);
  task.uid = uuid.v4();
  task.title = title;
  task.status = TaskStatusType.NeedsAction;
  task.lastModified = utcNow();
  task.component.updatePropertyWithValue("created", utcNow());
  if (parent) {
    task.relatedTo = parent.uid;
  }
  await savePimItem(etebase, colUid, task);
  return task;
}

function dueTime(task: TaskType) {
  return task.dueDate?.toJSDate().getTime() ?? Infinity;
}

function compare(sortBy: TaskSettingsType["sortBy"]) {
  return (a: TaskType, b: TaskType) => {
    if (sortBy === "title") {
      return (a.title ?? "").localeCompare(b.title ?? "");
    }
    return (dueTime(a) - dueTime(b)) || (Number(a.priority || 10) - Number(b.priority || 10)) || (a.title ?? "").localeCompare(b.title ?? "");
  };
}

function Check(props: { task: TaskType, onPress: () => void, size?: number }) {
  const theme = useTheme();
  const { task } = props;
  return (
    <TouchableRipple
      borderless
      accessibilityRole="checkbox"
      accessibilityLabel={`Done: ${task.title}`}
      accessibilityState={{ checked: task.finished }}
      aria-checked={task.finished}
      onPress={props.onPress}
      style={styles.check}
    >
      <MaterialCommunityIcons
        name={(task.finished) ? "checkbox-marked" : "checkbox-blank-outline"}
        size={props.size ?? 20}
        color={(task.finished) ? theme.colors.success : theme.colors.textMuted}
      />
    </TouchableRipple>
  );
}

interface RowProps {
  task: TaskType;
  list?: PimCollection;
  subtasks: TaskType[];
  selected: boolean;
  fmt: DateFormats;
  onToggle: (task: TaskType) => void;
  onPress: (task: TaskType) => void;
}

function TaskRow(props: RowProps) {
  const theme = useTheme();
  const { task, list, subtasks, fmt } = props;
  const due = formatDue(task, fmt);
  const done = subtasks.filter((x) => x.finished).length;
  return (
    <View style={styles.row}>
      <Check task={task} onPress={() => props.onToggle(task)} />
      <TouchableRipple
        style={{ flex: 1 }}
        accessibilityRole="button"
        accessibilityLabel={`Task ${task.title}`}
        aria-selected={props.selected}
        onPress={() => props.onPress(task)}
      >
        <View style={styles.rowInner}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={[styles.title, { color: (task.finished) ? theme.colors.textMuted : theme.colors.text },
              (task.finished) ? { textDecorationLine: "line-through" } : undefined]}>
              {task.title || "(no title)"}
            </Text>
            <View style={styles.meta}>
              {list && (
                <View style={styles.metaItem}>
                  <View style={[styles.dot, { backgroundColor: list.color }]} />
                  <Text style={styles.metaText(theme)}>{list.name}</Text>
                </View>
              )}
              {(subtasks.length > 0) && (
                <View style={styles.metaItem} accessibilityLabel={`${done} of ${subtasks.length} subtasks done`}>
                  <MaterialCommunityIcons name="file-tree-outline" size={13} color={theme.colors.textMuted} />
                  <Text style={styles.metaText(theme)}>{done}/{subtasks.length}</Text>
                </View>
              )}
              {task.isRecurring() && <MaterialCommunityIcons name="repeat" size={13} color={theme.colors.textMuted} />}
              {!!task.description && <MaterialCommunityIcons name="text" size={13} color={theme.colors.textMuted} />}
            </View>
          </View>
          {(priorityName(task) === "High") && (
            <MaterialCommunityIcons name="flag" size={16} color={theme.colors.warning} accessibilityLabel="High priority" />
          )}
          {due && (
            <Text style={[styles.due, { color: (task.overdue && !task.finished) ? theme.colors.error : theme.colors.textMuted }]}>{due}</Text>
          )}
        </View>
      </TouchableRipple>
    </View>
  );
}

// The details of the chosen task, next to the list on wide screens
function TaskDetails(props: { task: TaskType, list?: PimCollection, subtasks: TaskType[], fmt: DateFormats, onToggle: (task: TaskType) => void, onEdit: () => void, onClose: () => void }) {
  const theme = useTheme();
  const etebase = useCredentials()!;
  const { task, fmt, subtasks } = props;
  const [newSub, setNewSub] = React.useState("");
  const due = task.dueDate;
  const created = task.component.getFirstPropertyValue("created") ?? task.component.getFirstPropertyValue("dtstamp");
  const reminders = remindersOf(task.component).map((x) => reminderLabel(x, !due || due.isDate, true, fmt));
  const done = subtasks.filter((x) => x.finished).length;
  const field = (label: string, value: React.ReactNode) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <View style={{ flex: 1 }}>{(typeof value === "string") ? <Text style={{ color: theme.colors.text }}>{value}</Text> : value}</View>
    </View>
  );

  async function addSubtask() {
    const title = newSub.trim();
    if (title) {
      setNewSub("");
      await addTask(etebase, task.collectionUid!, title, task);
    }
  }

  return (
    <View style={{ gap: 18 }} testID="task-details">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <SmallButton icon={(task.finished) ? "checkbox-blank-outline" : "check"} label={(task.finished) ? "Mark as not done" : "Mark complete"} onPress={() => props.onToggle(task)} />
        <View style={{ flex: 1 }} />
        <IconButton icon="pencil-outline" size={18} accessibilityLabel="Edit task" iconColor={theme.colors.textSecondary} containerColor="transparent" onPress={props.onEdit} style={{ margin: 0 }} />
        <IconButton icon="close" size={18} accessibilityLabel="Close details" iconColor={theme.colors.textSecondary} containerColor="transparent" onPress={props.onClose} style={{ margin: 0 }} />
      </View>
      <Text style={[styles.detailsTitle, { color: theme.colors.text }, (task.finished) ? { textDecorationLine: "line-through", color: theme.colors.textMuted } : undefined]}>
        {task.title || "(no title)"}
      </Text>
      <View style={{ gap: 10 }}>
        {field("Due", (due) ? `${fmt.day.format(due.toJSDate())}${(due.isDate) ? "" : `, ${fmt.time(due.toJSDate())}`}` : "No date")}
        {(reminders.length > 0) && field((reminders.length === 1) ? "Reminder" : "Reminders", reminders.join(", "))}
        {field("Repeat", repeatName(task.rrule))}
        {field("List", (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.dot, { backgroundColor: props.list?.color ?? theme.colors.textMuted }]} />
            <Text style={{ color: theme.colors.text }}>{props.list?.name}</Text>
          </View>
        ))}
        {field("Priority", priorityName(task))}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Subtasks{(subtasks.length) ? ` · ${done} of ${subtasks.length}` : ""}</Text>
        {subtasks.map((x) => (
          <View key={x.uid} style={styles.subtask}>
            <Check task={x} size={18} onPress={() => props.onToggle(x)} />
            <Text style={{ flex: 1, color: (x.finished) ? theme.colors.textMuted : theme.colors.text, textDecorationLine: (x.finished) ? "line-through" : "none" }}>{x.title}</Text>
          </View>
        ))}
        <View style={[styles.subtask, { gap: 8 }]}>
          <MaterialCommunityIcons name="plus" size={18} color={theme.colors.textMuted} style={{ marginLeft: 6 }} />
          <TextInput
            value={newSub}
            onChangeText={setNewSub}
            onSubmitEditing={addSubtask}
            blurOnSubmit={false}
            placeholder="Add subtask"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Add subtask"
            style={[styles.inlineInput, { color: theme.colors.text }]}
          />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Notes</Text>
        <Text style={{ color: (task.description) ? theme.colors.textBody : theme.colors.textMuted }}>{task.description || "No notes"}</Text>
      </View>
      {created && (
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Created {fmt.day.format(created.toJSDate())}</Text>
      )}
    </View>
  );
}

export default function TasksScreen() {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const dialogs = useDialogs();
  const etebase = useCredentials()!;
  const syncGate = useSyncGate();
  const wide = useWindowDimensions().width >= 1100;
  const lists = usePimCollections(C.tasksType);
  const tasks = usePimItems(etebase, C.tasksType, TaskType.parse);
  const taskSettings = useSelector((state: StoreState) => state.settings.taskSettings);
  const { sortBy, showCompleted } = taskSettings;
  // (a list that isn't there anymore shows all of them)
  const filter = (lists.some((x) => x.colUid === taskSettings.filterBy)) ? taskSettings.filterBy : null;
  const [newTitle, setNewTitle] = React.useState("");
  const [selectedUid, setSelectedUid] = React.useState<string>();
  const fmt = useDateFormats();

  const byList = React.useMemo(() => new Map(lists.map((x) => [x.colUid, x])), [lists]);
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const all = (tasks ?? []).filter((x) => !filter || (x.collectionUid === filter));
  // Subtasks are shown in their task, not on their own (unless it isn't there)
  const uids = new Set(all.map((x) => x.uid));
  const subtasksOf = (task: TaskType) => all.filter((x) => x.relatedTo === task.uid).sort(compare("title"));
  const top = all.filter((x) => !(x.relatedTo && uids.has(x.relatedTo)));
  const sorted = [...top].sort(compare(sortBy));
  const open = sorted.filter((x) => !x.finished);
  const groups = [
    { title: "Overdue", items: open.filter((x) => x.dueDate && (x.dueDate.toJSDate() < today)), alert: true },
    { title: "Today", items: open.filter((x) => x.dueDate && (x.dueDate.toJSDate() >= today) && (x.dueDate.toJSDate() < tomorrow)) },
    { title: "Upcoming", items: open.filter((x) => x.dueDate && (x.dueDate.toJSDate() >= tomorrow)) },
    { title: "No date", items: open.filter((x) => !x.dueDate) },
    { title: "Completed", items: (showCompleted) ? sorted.filter((x) => x.finished) : [] },
  ].filter((x) => x.items.length > 0);
  // Today's progress: what's due today or was done today
  const todays = all.filter((x) => (x.dueDate && sameDay(x.dueDate.toJSDate(), today)) || (x.finished && x.completionDate && sameDay(x.completionDate.toJSDate(), today)));
  const doneToday = todays.filter((x) => x.finished).length;
  const doneCount = all.filter((x) => x.finished).length;
  const selected = (wide) ? all.find((x) => x.uid === selectedUid) : undefined;

  if (syncGate) {
    return syncGate;
  }
  if (!tasks) {
    return <LoadingIndicator />;
  }
  if (lists.length === 0) {
    return (
      <EmptyState
        icon="checkbox-marked-circle-outline"
        title="No task lists yet"
        text="Create a task list to add tasks to it."
        action={<AccentButton icon="plus" label="New task list" onPress={() => dialogs.newCollection("tasks")} />}
      />
    );
  }

  const addTo = filter ?? lists[0].colUid;

  async function add() {
    const title = newTitle.trim();
    if (title) {
      setNewTitle("");
      await addTask(etebase, addTo, title);
    }
  }

  async function toggle(task: TaskType) {
    const next = await setTaskDone(etebase, task, !task.finished);
    if (next) {
      dispatch(pushMessage({ message: `"${next.title}" is due again ${formatDue(next, fmt) ?? ""}`, severity: "success" }) as any);
    }
  }

  function press(task: TaskType) {
    if (wide) {
      setSelectedUid(task.uid);
    } else {
      navigation.navigate("TaskEdit", { colUid: task.collectionUid, itemUid: task.itemUid });
    }
  }

  const listName = (filter) ? byList.get(filter)?.name : "All tasks";

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.heading, { color: theme.colors.text }]} accessibilityRole="header">{listName}</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }} testID="tasks-progress">
              {fmt.weekDayLong.format(today)} {fmt.dayMonth.format(today)} · {(todays.length) ? `${doneToday} of ${todays.length} done today` : "nothing due today"}
            </Text>
          </View>
          <AccentButton icon="plus" label="New task" onPress={() => navigation.navigate("TaskEdit", { colUid: addTo })} />
        </View>
        <View style={styles.content}>
          {(todays.length > 0) && (
            <View style={[styles.progress, { backgroundColor: theme.colors.field }]} accessibilityLabel={`${doneToday} of ${todays.length} done today`}>
              <View style={[styles.progressBar, { width: `${doneToday / todays.length * 100}%`, backgroundColor: theme.colors.success }]} />
            </View>
          )}
          <View style={[styles.add, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <MaterialCommunityIcons name="plus" size={18} color={theme.colors.textMuted} />
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              onSubmitEditing={add}
              blurOnSubmit={false}
              placeholder={`Add a task to ${byList.get(addTo)?.name}`}
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Add a task"
              style={[styles.addInput, { color: theme.colors.text }]}
            />
            <Text style={[styles.enter, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>↵</Text>
          </View>
          {(groups.length === 0) && <EmptyState icon="check-all" title="Nothing to do" />}
          {groups.map((group) => (
            <View key={group.title} style={{ gap: 4 }} testID={`group-${group.title}`}>
              <Text style={[styles.groupTitle, { color: (group.alert) ? theme.colors.error : theme.colors.textMuted }]}>
                {group.title} <Text style={{ color: theme.colors.textMuted, fontFamily: fonts.regular }}>{group.items.length}</Text>
              </Text>
              <View style={[styles.list, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                {group.items.map((task, idx) => (
                  <View key={task.uid} style={[(idx > 0) ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider } : undefined,
                    (selected?.uid === task.uid) ? { backgroundColor: theme.colors.accentTint } : undefined]}>
                    <TaskRow
                      task={task}
                      list={(!filter) ? byList.get(task.collectionUid!) : undefined}
                      subtasks={subtasksOf(task)}
                      selected={selected?.uid === task.uid}
                      fmt={fmt}
                      onToggle={toggle}
                      onPress={press}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
          <TouchableRipple
            accessibilityRole="checkbox"
            accessibilityLabel={`Show completed (${doneCount})`}
            accessibilityState={{ checked: showCompleted }}
            aria-checked={showCompleted}
            onPress={() => dispatch(setSettings({ taskSettings: { ...taskSettings, showCompleted: !showCompleted } }) as any)}
            style={{ alignSelf: "flex-start", borderRadius: 8, padding: 6 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name={(showCompleted) ? "checkbox-marked" : "checkbox-blank-outline"} size={18} color={(showCompleted) ? theme.colors.accent : theme.colors.textMuted} />
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Show completed ({doneCount})</Text>
            </View>
          </TouchableRipple>
        </View>
      </ScrollView>
      {selected && (
        <ScrollView style={[{ width: 360, flexGrow: 0 }, panelStyle(theme)]} contentContainerStyle={{ padding: 20 }}>
          <TaskDetails
            task={selected}
            list={byList.get(selected.collectionUid!)}
            subtasks={subtasksOf(selected)}
            fmt={fmt}
            onToggle={toggle}
            onEdit={() => navigation.navigate("TaskEdit", { colUid: selected.collectionUid, itemUid: selected.itemUid })}
            onClose={() => setSelectedUid(undefined)}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = {
  ...StyleSheet.create({
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-end",
      gap: 12,
      paddingHorizontal: 28,
      paddingTop: 22,
      paddingBottom: 12,
    },
    heading: {
      fontFamily: fonts.semibold,
      fontSize: 26,
      letterSpacing: -0.3,
    },
    content: {
      width: "100%",
      maxWidth: 820,
      paddingHorizontal: 28,
      paddingBottom: 32,
      gap: 18,
    },
    progress: {
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressBar: {
      height: 6,
      borderRadius: 3,
    },
    add: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 10,
      paddingLeft: 12,
      paddingRight: 10,
    },
    addInput: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: fonts.regular,
      outlineStyle: "none",
    } as any,
    enter: {
      fontFamily: mono,
      fontSize: 11,
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 5,
    },
    groupTitle: {
      fontFamily: fonts.semibold,
      fontSize: 12,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      paddingLeft: 4,
    },
    list: {
      borderWidth: 1,
      borderRadius: 12,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    rowInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingRight: 14,
    },
    check: {
      padding: 12,
      borderRadius: 20,
    },
    title: {
      fontSize: 14,
      fontFamily: fonts.medium,
    },
    meta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 3,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 3,
    },
    due: {
      fontSize: 12,
      fontFamily: mono,
    },
    detailsTitle: {
      fontFamily: fonts.semibold,
      fontSize: 21,
    },
    field: {
      flexDirection: "row",
      alignItems: "center",
    },
    fieldLabel: {
      width: 90,
      fontSize: 13,
    },
    sectionTitle: {
      fontFamily: fonts.semibold,
      fontSize: 12,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    subtask: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 38,
    },
    inlineInput: {
      flex: 1,
      paddingVertical: 8,
      fontSize: 14,
      fontFamily: fonts.regular,
      outlineStyle: "none",
    } as any,
  }),
  metaText: (theme: ReturnType<typeof useTheme>) => ({ fontSize: 12, color: theme.colors.textMuted }),
};
