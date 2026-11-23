const dateButtons = [...document.querySelectorAll('[data-date]')];
const dateLabel = document.querySelector('[data-current-label]');
const title = document.querySelector('[data-current-title]');
const description = document.querySelector('[data-current-desc]');
const rest = document.querySelector('[data-rest]');
const report = document.querySelector('[data-report]');
const workout = document.querySelector('[data-workout]');
const workoutTools = document.querySelector('[data-training-tools]');
const courses = {
  17: { distance: '6 km', heartRate: '145', title: '賽後恢復 E 跑', detail: '只做恢復強度。腳感沉或睡不足 6 小時，依處方改 4 km 或休息；當天未跑就跳過。' },
  19: { distance: '7 km', heartRate: '150', title: '輕鬆跑', detail: '維持能完整交談的強度。有局部不適就縮短，當天不補差額。' },
  21: { distance: '12 km', heartRate: '150', title: '輕鬆長跑', detail: '全程輕鬆跑，心率超過 155 時走 1 分鐘再跑。帶水及電解質。疼痛、步態改變或疲勞未退時，依處方縮短到 8–10 km。' }
};

function selectDate(button) {
  const { date, day, title: dayTitle, desc } = button.dataset;
  dateButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  dateLabel.textContent = date === '18' ? '今天 · 週三 11/18' : `週${day} 11/${date}`;
  title.textContent = dayTitle;
  description.textContent = desc;
  description.hidden = date === '19' || date === '21';
  rest.hidden = !['16', '18', '20', '22'].includes(date);
  rest.open = false;
  report.hidden = date !== '17';
  const course = courses[date];
  workout.hidden = !course;
  workoutTools.open = false;
  if (course) {
    workout.querySelector('[data-course-hr]').textContent = '心率上限 ' + course.heartRate + ' bpm';
    workout.querySelector('[data-main-title]').textContent = '主課 · ' + course.title + ' ' + course.distance;
    workout.querySelector('[data-main-detail]').textContent = course.detail;
  }
}

dateButtons.forEach(button => button.addEventListener('click', () => selectDate(button)));
document.querySelectorAll('[data-pick]').forEach(link => link.addEventListener('click', () => {
  const button = dateButtons.find(item => item.dataset.date === link.dataset.pick);
  const picker = button.closest('details');
  if (picker) picker.open = true;
  selectDate(button);
}));

function updateView() {
  const views = [...workspace.querySelectorAll(':scope > section')];
  const selected = views.find(view => location.hash === '#' + view.id) ||
    (location.hash === '#run-report' ? document.getElementById('records') : null);
  document.querySelector('.plan-grid').hidden = Boolean(selected);
  document.querySelector('.secondary-grid').hidden = !selected;
  views.forEach(view => { view.hidden = view !== selected; });
  if (location.hash === '#run-report') {
    selectRecordView('activities');
    document.getElementById('run-report').open = true;
  }
  document.querySelectorAll('.tabs a').forEach(link => {
    const active = link.getAttribute('href') === (selected ? '#' + selected.id : '#schedule');
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

window.addEventListener('hashchange', updateView);
updateView();
