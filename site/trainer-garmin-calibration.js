// Garmin calibration boundary: exclude terrain/extreme heat and normalize moderate heat.
function isFlatEnoughRun(run) {
  if (!(run.km > 0)) return true;
  const terrain = run.terrainSummary;
  // 詳細分段有明顯上下坡時，不能把它誤當成平路能力變化。
  if (terrain && Number(terrain.max_abs_grade_pct) >= 5) return false;
  return (Number(run.elevationGainM) || 0) / run.km <= 15;
}

function calibrationDataQuality(run) {
  const reasons = [];
  const terrain = run?.terrainSummary;
  if (/treadmill|indoor|virtual/i.test(String(run?.name || ''))) reasons.push('跑步機／室內跑缺少可比路面條件');
  if (terrain && Number(terrain.max_abs_grade_pct) >= 5) reasons.push(`最大分段坡度 ${terrain.max_abs_grade_pct}%`);
  else if (!isFlatEnoughRun(run || {})) reasons.push('總爬升偏高');
  if (Number(run?.temperatureC) >= 35) reasons.push(`高溫 ${run.temperatureC}°C`);
  const forecast = run?.date === todayStr() ? trainerWeather?.[run.date] : null;
  if (Number(forecast?.tmax) >= 36) reasons.push(`預報高溫 ${forecast.tmax}°C`);
  if (Number(forecast?.rain) >= 70) reasons.push(`降雨機率 ${forecast.rain}%`);
  return { usable: reasons.length === 0, reasons, terrainAvailable: Boolean(terrain?.segments?.length) };
}

function isCalibrationSafeRun(run) {
  return calibrationDataQuality(run).usable;
}

function heatAdjustedPaceSec(run) {
  const pace = Number(run.paceSeconds) || 0;
  const temp = Number(run.temperatureC);
  if (!pace || !Number.isFinite(temp) || temp <= 22) return pace;
  return pace - Math.min((temp - 22) * 2.5, 45);
}
