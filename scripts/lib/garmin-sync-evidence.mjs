const requiredSteps = ["Fetch Garmin running activities", "Build encrypted training review"];

// A scheduled run that exits after the guard also has conclusion "success".
export function hasGarminSyncEvidence(jobs) {
  return jobs.some((job) => job.conclusion === "success" && requiredSteps.every((name) =>
    job.steps.some((step) => step.name === name && step.conclusion === "success")
  ));
}
