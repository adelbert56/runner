const OWNER_REPO = process.env.GITHUB_REPOSITORY || "adelbert56/runner";
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const BRANCH = process.env.ORCHESTRATOR_BRANCH || "main";
const DRY_RUN = process.argv.includes("--dry-run");
const CAN_READ_GITHUB = Boolean(GH_TOKEN);
const CAN_DISPATCH = CAN_READ_GITHUB && !DRY_RUN;
const TAIPEI_OFFSET_HOURS = 8;

const TASKS = [
  {
    name: "Refresh race weather",
    workflow: "weather-refresh.yml",
    slots: [{ days: [0, 1, 2, 3, 4, 5, 6], due: "07:23", deadline: "15:30" }],
  },
  {
    name: "Refresh race data",
    workflow: "data-refresh.yml",
    slots: [{ days: [2, 4], due: "18:17", deadline: "23:59" }],
  },
  {
    name: "Collect content candidates",
    workflow: "content-candidates.yml",
    slots: [{ days: [0, 1, 2, 3, 4, 5, 6], due: "09:17", deadline: "18:00" }],
  },
  {
    name: "Refresh runner quips",
    workflow: "runner-quips-refresh.yml",
    slots: [{ days: [1], due: "10:23", deadline: "18:00" }],
  },
  {
    name: "Refresh message cloud",
    workflow: "message-cloud-refresh.yml",
    slots: [
      { days: [0, 1, 2, 3, 4, 5, 6], due: "12:07", deadline: "17:59" },
      { days: [0, 1, 2, 3, 4, 5, 6], due: "18:07", deadline: "23:59" },
    ],
  },
  {
    name: "Sync Garmin training data",
    workflow: "garmin-sync.yml",
    slots: [{ days: [0, 1, 2, 3, 4, 5, 6], due: "20:30", deadline: "23:59" }],
  },
];

function parseHm(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function taipeiParts(now = new Date()) {
  const shifted = new Date(now.getTime() + TAIPEI_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function slotStartUtc(parts, due) {
  const [hour, minute] = due.split(":").map(Number);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - TAIPEI_OFFSET_HOURS, minute));
}

function activeSlot(task, now = new Date()) {
  const parts = taipeiParts(now);
  for (const slot of task.slots) {
    if (!slot.days.includes(parts.weekday)) {
      continue;
    }
    const dueMinute = parseHm(slot.due);
    const deadlineMinute = parseHm(slot.deadline);
    if (parts.minuteOfDay >= dueMinute && parts.minuteOfDay <= deadlineMinute) {
      return { ...slot, startUtc: slotStartUtc(parts, slot.due) };
    }
  }
  return null;
}

async function gh(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${OWNER_REPO}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "runner-automation-orchestrator",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${body}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function recentRuns(workflow) {
  const query = new URLSearchParams({ branch: BRANCH, per_page: "20" });
  const data = await gh(`/actions/workflows/${workflow}/runs?${query}`);
  return data.workflow_runs || [];
}

function hasRunAfterSlot(runs, startUtc) {
  return runs.some((run) => {
    const createdAt = new Date(run.created_at);
    if (createdAt < startUtc) {
      return false;
    }
    if (run.status === "queued" || run.status === "in_progress" || run.status === "waiting") {
      return true;
    }
    return run.status === "completed" && run.conclusion === "success";
  });
}

async function dispatch(workflow) {
  await gh(`/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: BRANCH }),
  });
}

const decisions = [];

for (const task of TASKS) {
  const slot = activeSlot(task);
  if (!slot) {
    decisions.push(`${task.name}: not due now`);
    continue;
  }

  const runs = CAN_READ_GITHUB ? await recentRuns(task.workflow) : [];
  if (CAN_READ_GITHUB && hasRunAfterSlot(runs, slot.startUtc)) {
    decisions.push(`${task.name}: already covered since ${slot.startUtc.toISOString()}`);
    continue;
  }

  decisions.push(`${task.name}: dispatch ${task.workflow} for missed slot ${slot.due} Asia/Taipei`);
  if (CAN_DISPATCH) {
    await dispatch(task.workflow);
  }
}

console.log(decisions.join("\n"));
if (!CAN_READ_GITHUB) {
  console.log("No GITHUB_TOKEN available; skipped GitHub run lookup and dispatch.");
} else if (DRY_RUN) {
  console.log("Dry run only; no workflows were dispatched.");
}
