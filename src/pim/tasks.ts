// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// The priorities of tasks, and how the task list sorts, groups and filters them

import { TaskType } from "./pim-types";
import { addDays, startOfDay } from "./occurrences";

export type Priority = "high" | "medium" | "low" | "none";

// From the highest to none, the order they're sorted and listed in
export const priorities: Priority[] = ["high", "medium", "low", "none"];

export const priorityLabels: { [key in Priority]: string } = { high: "High", medium: "Medium", low: "Low", none: "None" };

// What's written to PRIORITY for each (none removes it)
const priorityValues: { [key in Priority]: number } = { high: 1, medium: 5, low: 9, none: 0 };

// Priorities 1-4 are high, 5 medium, 6-9 low, and 0, none or anything else none (RFC 5545)
export function priorityOf(task: TaskType): Priority {
  const p = Number(task.priority ?? 0);
  return (p >= 1 && p <= 4) ? "high" : (p === 5) ? "medium" : (p >= 6 && p <= 9) ? "low" : "none";
}

// "High priority", or "No priority"
export function priorityTitle(priority: Priority) {
  return (priority === "none") ? "No priority" : `${priorityLabels[priority]} priority`;
}

// Changes the priority, only when it's another one: a PRIORITY:2 from another app stays 2 while it's
// still high
export function setPriority(task: TaskType, priority: Priority) {
  if (priorityOf(task) === priority) {
    return false;
  }
  if (priority === "none") {
    task.component.removeAllProperties("priority");
  } else {
    task.priority = priorityValues[priority];
  }
  return true;
}

// "!high", "!medium" and "!low" as words of a task's title, which set its priority (the last one
// that's there). They're taken out of the title.
export function parseQuickAdd(text: string): { title: string, priority: Priority } {
  let priority: Priority = "none";
  const title = text.replace(/(^|\s)!(high|medium|low)(?=\s|$)/gi, (_match, before: string, level: string) => {
    priority = level.toLowerCase() as Priority;
    return before;
  });
  return { title: title.replace(/\s{2,}/g, " ").trim(), priority };
}

function dueDay(task: TaskType) {
  const due = task.dueDate;
  return (due) ? startOfDay(due.toJSDate()).getTime() : Infinity;
}

// When it was made, for the order of tasks that are alike otherwise
function createdTime(task: TaskType) {
  const created = task.component.getFirstPropertyValue("created") ?? task.component.getFirstPropertyValue("dtstamp");
  return created?.toJSDate().getTime() ?? Infinity;
}

const rank = (task: TaskType) => priorities.indexOf(priorityOf(task));

// The order of tasks that aren't done: by the day they're due (none last), then the highest priority
// first, then the ones due all day before the ones at a time, then by the time, then the oldest first
export function compareOpenTasks(a: TaskType, b: TaskType) {
  const day = dueDay(a) - dueDay(b);
  if (day) {
    return day;
  }
  const allDayA = !a.dueDate || a.dueDate.isDate;
  const allDayB = !b.dueDate || b.dueDate.isDate;
  return (rank(a) - rank(b)) ||
    (Number(!allDayA) - Number(!allDayB)) ||
    ((allDayA) ? 0 : (a.dueDate!.toJSDate().getTime() - b.dueDate!.toJSDate().getTime())) ||
    (createdTime(a) - createdTime(b)) ||
    (a.title ?? "").localeCompare(b.title ?? "");
}

// The done ones: the last one done first
export function compareDoneTasks(a: TaskType, b: TaskType) {
  const time = (x: TaskType) => x.completionDate?.toJSDate().getTime() ?? -Infinity;
  return (time(b) - time(a)) || (a.title ?? "").localeCompare(b.title ?? "");
}

export type TaskGroupBy = "date" | "priority";

export interface TaskGroup {
  key: string;
  title: string;
  // (for the groups of priorities)
  priority?: Priority;
  items: TaskType[];
}

// The tasks that aren't done in their groups, the empty groups left out. The tasks have to be sorted.
export function groupTasks(open: TaskType[], groupBy: TaskGroupBy, now = new Date()): TaskGroup[] {
  let groups: TaskGroup[];
  if (groupBy === "priority") {
    groups = priorities.map((priority) => ({
      key: priority,
      title: (priority === "none") ? "No priority" : priorityLabels[priority],
      priority,
      items: open.filter((x) => priorityOf(x) === priority),
    }));
  } else {
    const today = startOfDay(now).getTime();
    const tomorrow = addDays(startOfDay(now), 1).getTime();
    groups = [
      { key: "overdue", title: "Overdue", items: open.filter((x) => dueDay(x) < today) },
      { key: "today", title: "Today", items: open.filter((x) => (dueDay(x) >= today) && (dueDay(x) < tomorrow)) },
      { key: "upcoming", title: "Upcoming", items: open.filter((x) => (dueDay(x) >= tomorrow) && (dueDay(x) < Infinity)) },
      { key: "none", title: "No date", items: open.filter((x) => !x.dueDate) },
    ];
  }
  return groups.filter((x) => x.items.length > 0);
}
