// The priorities of tasks, and the order and groups of the task list, with the tasks of the spec
// ("today" is Friday 9 October 2026): PRIORITY read in the ranges of RFC 5545 and left as it is
// unless it's changed, the tasks of a day by priority before their time, and "!high" in a new task.
process.env.TZ = "Europe/Berlin";
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

const { TaskType } = require("../src/pim/pim-types");
const {
  compareDoneTasks, compareOpenTasks, groupTasks, parseQuickAdd, priorityOf, setPriority,
} = require("../src/pim/tasks");

const now = new Date(2026, 9, 9, 12, 0);

let count = 0;
function taskOf(title, due, priority, done) {
  count++;
  const lines = ["BEGIN:VTODO", `UID:task-${count}`, "DTSTAMP:20261001T000000Z", `CREATED:202610010000${String(count).padStart(2, "0")}Z`, `SUMMARY:${title}`];
  if (due) {
    lines.push((due.length === 8) ? `DUE;VALUE=DATE:${due}` : `DUE;TZID=Europe/Berlin:${due}`);
  }
  if (priority !== undefined) {
    lines.push(`PRIORITY:${priority}`);
  }
  if (done) {
    lines.push("STATUS:COMPLETED", `COMPLETED:${done}`);
  } else {
    lines.push("STATUS:NEEDS-ACTION");
  }
  lines.push("END:VTODO");
  return TaskType.parse(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test", ...lines, "END:VCALENDAR", ""].join("\r\n"));
}

const tasks = [
  taskOf("Send invoice", "20261008", 1),
  taskOf("Draft offline-mode scope", "20261009T170000", 1),
  taskOf("Pick up dry cleaning", "20261009"),
  taskOf("Call mum", "20261009T190000", 9),
  taskOf("Book the offsite room", "20261009", 5, "20261009T080000Z"),
  taskOf("Prepare slides", "20261013", 5),
  taskOf("Book passport appointment", "20261015", 9, "20261008T080000Z"),
  taskOf("Buy a gift for Maya", "20261019", 5),
  taskOf("Sort out old photo backups", undefined, 0),
];

const open = (list) => list.filter((x) => !x.finished).sort(compareOpenTasks);
const titles = (groups) => Object.fromEntries(groups.map((g) => [g.title, g.items.map((x) => x.title)]));

test("grouped by due date, a day's tasks by priority, then all day before timed ones", () => {
  assert.deepEqual(titles(groupTasks(open(tasks), "date", now)), {
    "Overdue": ["Send invoice"],
    "Today": ["Draft offline-mode scope", "Call mum", "Pick up dry cleaning"],
    "Upcoming": ["Prepare slides", "Buy a gift for Maya"],
    "No date": ["Sort out old photo backups"],
  });
});

test("grouped by priority, by day within each", () => {
  assert.deepEqual(titles(groupTasks(open(tasks), "priority", now)), {
    "High": ["Send invoice", "Draft offline-mode scope"],
    "Medium": ["Prepare slides", "Buy a gift for Maya"],
    "Low": ["Call mum"],
    "No priority": ["Pick up dry cleaning", "Sort out old photo backups"],
  });
});

test("of the same priority on the same day, the time decides", () => {
  const callMum = taskOf("Call mum", "20261009T190000", 2);
  const today = groupTasks(open([...tasks.filter((x) => x.title !== "Call mum"), callMum]), "date", now).find((x) => x.title === "Today");
  assert.deepEqual(today.items.map((x) => x.title), ["Draft offline-mode scope", "Call mum", "Pick up dry cleaning"]);
});

test("the done ones, the last one done first", () => {
  assert.deepEqual(tasks.filter((x) => x.finished).sort(compareDoneTasks).map((x) => x.title), ["Book the offsite room", "Book passport appointment"]);
});

test("PRIORITY in the ranges of RFC 5545", () => {
  const levels = [0, 1, 2, 4, 5, 6, 9, 10, undefined].map((p) => priorityOf(taskOf("x", undefined, p)));
  assert.deepEqual(levels, ["none", "high", "high", "high", "medium", "low", "low", "none", "none"]);
});

test("PRIORITY stays as it is unless the priority is changed", () => {
  const task = taskOf("Fix tap", undefined, 2);
  assert.equal(setPriority(task, "high"), false);
  task.title = "Fix the tap";
  assert.match(task.toIcal(), /\r\nPRIORITY:2\r\n/);
  assert.equal(setPriority(task, "low"), true);
  assert.match(task.toIcal(), /\r\nPRIORITY:9\r\n/);
  setPriority(task, "none");
  assert.doesNotMatch(task.toIcal(), /PRIORITY/);
});

test("!high, !medium and !low in a new task's title set its priority", () => {
  assert.deepEqual(parseQuickAdd("Email Jonas !high"), { title: "Email Jonas", priority: "high" });
  assert.deepEqual(parseQuickAdd("Fix tap !low !medium"), { title: "Fix tap", priority: "medium" });
  assert.deepEqual(parseQuickAdd("Ask about !urgent stuff"), { title: "Ask about !urgent stuff", priority: "none" });
  assert.deepEqual(parseQuickAdd("!HIGH Pay  the !low rent"), { title: "Pay the rent", priority: "low" });
  assert.deepEqual(parseQuickAdd("Read about!high things"), { title: "Read about!high things", priority: "none" });
});
