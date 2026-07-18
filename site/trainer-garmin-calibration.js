// Garmin calibration boundary: exclude terrain/extreme heat and normalize moderate heat.
function isFlatEnoughRun(run) {
  if (!(run.km > 0)) return true;
  return (Number(run.elevationGainM) || 0) / run.km <= 15;
}

function isCalibrationSafeRun(run) {
  if (!isFlatEnoughRun(run)) return false;
  // 30–34°C 的跑步改用 heatAdjustedPaceSec 折算後參與校準；極端高溫仍排除。
  if (Number(run.temperatureC) >= 35) return false;
  const forecast = run.date === todayStr() ? trainerWeather?.[run.date] : null;
  if (Number(forecast?.tmax) >= 36) return false;
  return true;
}

function heatAdjustedPaceSec(run) {
  const pace = Number(run.paceSeconds) || 0;
  const temp = Number(run.temperatureC);
  if (!pace || !Number.isFinite(temp) || temp <= 22) return pace;
  return pace - Math.min((temp - 22) * 2.5, 45);
}
