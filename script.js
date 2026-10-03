let dailyDeficit = 0;
let weightLossLabel = '';
let monthsLabel = '';
let monthsValue = 0;
let totalCaloriesToLose = 0;
let computedTdee = 0;
let currentGender = 'female';
let endedManually = false;
let trackerStart = 0;
let days = [];
let gameOverDay = 0;
let timerHandle = null;
let levelThresholds = [];

const DAY_LENGTH_MINUTES = 24 * 60; // set to 2 to test day rollover quickly
const DAY_MS = DAY_LENGTH_MINUTES * 60 * 1000;
const URGENT_MS = DAY_MS / 24;

const TRACKER_STORAGE_KEY = 'calorieDeficitTracker';

const step1 = document.getElementById('step-1');
const weightLossInput = document.getElementById('weight-loss');
const monthsInput = document.getElementById('months');
const weightLossError = document.getElementById('weight-loss-error');
const monthsError = document.getElementById('months-error');
const formError1 = document.getElementById('form-error-1');

const step2 = document.getElementById('step-2');
const ageInput = document.getElementById('age');
const heightInput = document.getElementById('height');
const currentWeightInput = document.getElementById('current-weight');
const activitySelect = document.getElementById('activity-level');
const ageError = document.getElementById('age-error');
const heightError = document.getElementById('height-error');
const currentWeightError = document.getElementById('current-weight-error');
const formError2 = document.getElementById('form-error-2');

const step3 = document.getElementById('step-3');
const result = document.getElementById('result');
const resultNumber = document.getElementById('result-number');
const resultSentence = document.getElementById('result-sentence');
const gaugeMarker = document.getElementById('gauge-marker');
const warningBanner = document.getElementById('warning-banner');
const lowIntakeBanner = document.getElementById('low-intake-banner');
const lowIntakeText = document.getElementById('low-intake-text');
const statBmr = document.getElementById('stat-bmr');
const tdeeAdjustInput = document.getElementById('tdee-adjust');
const weightAdjustInput = document.getElementById('weight-adjust');
const statDeficit = document.getElementById('stat-deficit');

const step4 = document.getElementById('step-4');
const levelBadge = document.getElementById('level-badge');
const levelSegs = document.querySelectorAll('#level-track .level-seg');
const levelCaption = document.getElementById('level-caption');
const exitButton = document.getElementById('exit-game');
const confirmBox = document.getElementById('confirm-box');
const keepPlayingButton = document.getElementById('keep-playing');
const confirmEndButton = document.getElementById('confirm-end');
const dayTimer = document.getElementById('day-timer');
const dayTimerLabel = document.getElementById('day-timer-label');
const dayTimerClock = document.getElementById('day-timer-clock');
const logForm = document.getElementById('log-form');
const eatenInput = document.getElementById('eaten-input');
const eatenError = document.getElementById('eaten-error');
const stepsInput = document.getElementById('steps-input');
const stepsError = document.getElementById('steps-error');
const dayBanner = document.getElementById('day-banner');
const dayBannerText = document.getElementById('day-banner-text');
const logList = document.getElementById('log-list');

const steps = [step1, step2, step3, step4];
const stepLabel = document.getElementById('step-label');
const progressSegs = document.querySelectorAll('.progress-seg');
const progressWrap = document.getElementById('progress-wrap');
const subhead = document.getElementById('page-subhead');

const SUBHEADS = {
  1: 'Turn a weight-loss goal into the daily calorie target that gets you there.',
  2: 'Now estimate your maintenance calories so we can turn that target into a daily intake.',
  3: 'Here is your personalized daily calorie plan.'
};

const KCAL_PER_KG = 7700;
const DAYS_PER_MONTH = 30;
const GAUGE_MAX = 1500;
const AGGRESSIVE_THRESHOLD = 1000;

function goToStep(n) {
  steps.forEach((el, i) => el.classList.toggle('active', i === n - 1));
  progressWrap.style.display = '';
  stepLabel.textContent = 'Step ' + n + ' of 3';
  progressSegs.forEach((seg, i) => seg.classList.toggle('done', i < n));
  subhead.textContent = SUBHEADS[n];
  const focusTarget = steps[n - 1].querySelector('input, select, button');
  if (focusTarget) focusTarget.focus();
}

function computeLevelThresholds(total) {
  const arr = [0];
  for (let i = 1; i <= 10; i++) {
    arr.push(Math.round(total * i * (i + 1) / 110));
  }
  return arr;
}

function startTracker() {
  steps.forEach((el, i) => el.classList.toggle('active', i === 3));
  progressWrap.style.display = 'none';
  subhead.textContent = 'Log today’s calories and steps to climb the ladder.';

  levelThresholds = computeLevelThresholds(totalCaloriesToLose);
  trackerStart = Date.now();
  days = [];
  gameOverDay = 0;
  endedManually = false;
  eatenInput.value = '';
  stepsInput.value = '';
  dayBanner.classList.remove('visible', 'positive', 'negative');
  renderLog();
  renderTracker();
  saveTrackerState();
  startTimer();

  const focusTarget = step4.querySelector('input, select, button');
  if (focusTarget) focusTarget.focus();
}

function currentDayIndex(now) {
  return Math.max(1, Math.floor((now - trackerStart) / DAY_MS) + 1);
}

function trackerProgress() {
  return days.reduce((sum, entry) => sum + entry.netDeficit, 0);
}

function completedLevels() {
  const progress = Math.max(0, trackerProgress());
  let level = 0;
  for (let i = 1; i <= 10; i++) {
    if (progress >= levelThresholds[i]) level = i;
  }
  return level;
}

function checkMissedDay(now) {
  if (gameOverDay || endedManually || completedLevels() >= 10) return;
  const today = currentDayIndex(now);
  for (let d = 1; d < today; d++) {
    if (!days.some(entry => entry.day === d)) {
      gameOverDay = d;
      return;
    }
  }
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = n => String(n).padStart(2, '0');
  return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total % 3600 / 60)) + ':' + pad(total % 60);
}

function updateTimer() {
  const now = Date.now();
  const today = currentDayIndex(now);
  const remaining = trackerStart + today * DAY_MS - now;
  const logged = days.some(entry => entry.day === today);
  dayTimerLabel.textContent = 'Day ' + today + (logged ? ' · logged' : ' · not logged yet');
  dayTimerClock.textContent = formatClock(remaining);
  dayTimer.classList.toggle('urgent', !logged && remaining < URGENT_MS);
}

function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}

function startTimer() {
  stopTimer();
  if (gameOverDay || endedManually || completedLevels() >= 10) return;
  updateTimer();
  timerHandle = setInterval(tick, 1000);
}

function tick() {
  checkMissedDay(Date.now());
  if (gameOverDay) {
    stopTimer();
    renderTracker();
    saveTrackerState();
    return;
  }
  updateTimer();
}

function renderTracker() {
  const progress = Math.max(0, trackerProgress());
  const level = completedLevels();

  levelSegs.forEach((seg, idx) => {
    const i = idx + 1;
    const start = levelThresholds[i - 1];
    const end = levelThresholds[i];
    const span = end - start;
    const fillPct = span <= 0 ? 100 : Math.min(100, Math.max(0, (progress - start) / span * 100));
    seg.querySelector('.fill').style.width = fillPct + '%';
  });

  const complete = level >= 10;
  const missed = !complete && gameOverDay > 0;
  const quit = !complete && !missed && endedManually;
  const finished = complete || missed || quit;
  if (finished) setConfirming(false);
  logForm.hidden = finished;
  dayTimer.hidden = finished;
  exitButton.dataset.mode = finished ? 'home' : 'end';
  exitButton.textContent = finished ? 'Home' : 'End game';

  if (complete) {
    const finalDay = days.length ? days[days.length - 1].day : 0;
    levelBadge.textContent = 'Goal reached';
    levelCaption.textContent = Math.round(totalCaloriesToLose).toLocaleString('en-US') + ' / ' +
      Math.round(totalCaloriesToLose).toLocaleString('en-US') + ' kcal · all 10 levels completed in ' +
      finalDay + (finalDay === 1 ? ' day' : ' days');
    return true;
  }

  if (missed) {
    levelBadge.textContent = 'Game over';
    levelCaption.textContent = Math.round(progress).toLocaleString('en-US') + ' / ' +
      totalCaloriesToLose.toLocaleString('en-US') + ' kcal · stopped at Level ' + (level + 1);
    dayBanner.classList.remove('positive');
    dayBanner.classList.add('negative', 'visible');
    dayBannerText.textContent = 'Day ' + gameOverDay + ' ended with no entry. The game is over.';
    return true;
  }

  if (quit) {
    levelBadge.textContent = 'Game ended';
    levelCaption.textContent = Math.round(progress).toLocaleString('en-US') + ' / ' +
      totalCaloriesToLose.toLocaleString('en-US') + ' kcal · ended at Level ' + (level + 1);
    dayBanner.classList.remove('visible', 'positive', 'negative');
    return true;
  }

  const displayLevel = level + 1;
  const nextThreshold = levelThresholds[displayLevel];
  const kcalToNext = Math.max(0, Math.round(nextThreshold - progress));
  const nextLabel = displayLevel === 10 ? 'your goal' : 'Level ' + (displayLevel + 1);

  levelBadge.textContent = 'Level ' + displayLevel;
  levelCaption.textContent = Math.round(progress).toLocaleString('en-US') + ' / ' +
    totalCaloriesToLose.toLocaleString('en-US') + ' kcal · ' +
    kcalToNext.toLocaleString('en-US') + ' kcal to ' + nextLabel;
  return false;
}

function renderLog() {
  logList.innerHTML = '';
  days.slice().reverse().forEach(entry => {
    const row = document.createElement('div');
    row.className = 'log-row';
    const sign = entry.netDeficit >= 0 ? '−' : '+';
    const magnitude = Math.abs(Math.round(entry.netDeficit));
    row.innerHTML =
      '<span class="log-day">Day ' + entry.day + '</span>' +
      '<span class="log-detail">' + Math.round(entry.eaten).toLocaleString('en-US') + ' kcal eaten · ' +
      Math.round(entry.steps).toLocaleString('en-US') + ' steps (' +
      Math.round(entry.stepsCalories).toLocaleString('en-US') + ' kcal)</span>' +
      '<span class="log-net ' + (entry.netDeficit >= 0 ? 'positive' : 'negative') + '">' +
      sign + magnitude.toLocaleString('en-US') + ' kcal</span>';
    logList.appendChild(row);
  });
}

function saveTrackerState() {
  try {
    localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify({
      totalCaloriesToLose,
      trackerStart,
      days,
      gameOverDay,
      endedManually,
      tdee: computedTdee,
      currentWeightKg: parseFloat(currentWeightInput.value) || 0
    }));
  } catch (e) {}
}

function loadTrackerState() {
  try {
    const raw = localStorage.getItem(TRACKER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.totalCaloriesToLose || !data.trackerStart || !Array.isArray(data.days)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function restoreTracker(data) {
  currentWeightInput.value = data.currentWeightKg;
  totalCaloriesToLose = data.totalCaloriesToLose;
  computedTdee = data.tdee;
  trackerStart = data.trackerStart;
  days = data.days;
  gameOverDay = data.gameOverDay || 0;
  endedManually = !!data.endedManually;
  levelThresholds = computeLevelThresholds(totalCaloriesToLose);

  const alreadyOver = gameOverDay > 0;
  checkMissedDay(Date.now());
  if (gameOverDay && !alreadyOver) saveTrackerState();

  renderLog();
  eatenInput.value = '';
  stepsInput.value = '';
  dayBanner.classList.remove('visible', 'positive', 'negative');

  steps.forEach((el, i) => el.classList.toggle('active', i === 3));
  progressWrap.style.display = 'none';
  subhead.textContent = 'Log today’s calories and steps to climb the ladder.';

  renderTracker();
  startTimer();
}

function setConfirming(on) {
  confirmBox.hidden = !on;
  exitButton.hidden = on;
}

function cancelEndGame() {
  setConfirming(false);
  exitButton.focus();
}

function endGame() {
  endedManually = true;
  stopTimer();
  renderTracker();
  saveTrackerState();
  exitButton.focus();
}

function goHome() {
  stopTimer();
  try { localStorage.removeItem(TRACKER_STORAGE_KEY); } catch (e) {}
  trackerStart = 0;
  days = [];
  gameOverDay = 0;
  endedManually = false;
  goToStep(1);
}

function showDayBanner(entry) {
  dayBanner.classList.remove('positive', 'negative');
  const amount = Math.round(Math.abs(entry.netDeficit)).toLocaleString('en-US');
  if (entry.netDeficit >= 0) {
    dayBanner.classList.add('positive');
    dayBannerText.textContent = 'Day ' + entry.day + ': ' + amount + ' kcal deficit.';
  } else {
    dayBanner.classList.add('negative');
    dayBannerText.textContent = 'Day ' + entry.day + ': ' + amount + ' kcal surplus.';
  }
  dayBanner.classList.add('visible');
}

function submitLogDay(event) {
  event.preventDefault();
  clearFieldError(eatenInput, eatenError);
  clearFieldError(stepsInput, stepsError);

  const eatenRaw = eatenInput.value.trim();
  const stepsRaw = stepsInput.value.trim();
  const eaten = parseFloat(eatenRaw);
  const stepsTaken = parseFloat(stepsRaw);
  let hasError = false;

  if (eatenRaw === '' || isNaN(eaten) || eaten < 0) {
    markInvalid(eatenInput, eatenError, 'Enter calories eaten (0 or more).');
    hasError = true;
  }
  if (stepsRaw === '' || isNaN(stepsTaken) || stepsTaken < 0) {
    markInvalid(stepsInput, stepsError, 'Enter steps (0 or more).');
    hasError = true;
  }

  if (hasError) return;

  const now = Date.now();
  checkMissedDay(now);
  if (gameOverDay) {
    stopTimer();
    renderTracker();
    saveTrackerState();
    return;
  }

  const today = currentDayIndex(now);
  let entry = days.find(item => item.day === today);
  if (!entry) {
    entry = { day: today, eaten: 0, steps: 0, stepsCalories: 0, netDeficit: 0 };
    days.push(entry);
  }

  const currentWeightKg = parseFloat(currentWeightInput.value) || 0;
  entry.eaten += eaten;
  entry.steps += stepsTaken;
  entry.stepsCalories = entry.steps * currentWeightKg * 0.0005;
  entry.netDeficit = computedTdee + entry.stepsCalories - entry.eaten;

  renderLog();
  showDayBanner(entry);
  const ended = renderTracker();
  saveTrackerState();

  eatenInput.value = '';
  stepsInput.value = '';
  if (ended) {
    stopTimer();
    exitButton.focus();
  } else {
    updateTimer();
    eatenInput.focus();
  }
}

function clearFieldError(input, errorEl) {
  input.removeAttribute('aria-invalid');
  errorEl.textContent = '';
}

function markInvalid(input, errorEl, message) {
  input.setAttribute('aria-invalid', 'true');
  errorEl.textContent = message;
}

function submitStep1(event) {
  event.preventDefault();
  clearFieldError(weightLossInput, weightLossError);
  clearFieldError(monthsInput, monthsError);
  formError1.classList.remove('visible');

  const weightRaw = weightLossInput.value.trim();
  const monthsRaw = monthsInput.value.trim();
  const weight = parseFloat(weightRaw);
  const months = parseFloat(monthsRaw);
  let hasError = false;

  if (weightRaw === '' || isNaN(weight) || weight <= 0) {
    markInvalid(weightLossInput, weightLossError, 'Enter a weight above zero.');
    hasError = true;
  }
  if (monthsRaw === '' || isNaN(months) || months <= 0) {
    markInvalid(monthsInput, monthsError, 'Enter a timeframe above zero.');
    hasError = true;
  }

  if (hasError) {
    formError1.textContent = 'Fix the fields above to continue.';
    formError1.classList.add('visible');
    return;
  }

  const totalCalories = weight * KCAL_PER_KG;
  const totalDays = months * DAYS_PER_MONTH;
  dailyDeficit = Math.round(totalCalories / totalDays);
  totalCaloriesToLose = totalCalories;
  weightLossLabel = weightRaw.replace(/\.0+$/, '');
  monthsLabel = monthsRaw.replace(/\.0+$/, '');
  monthsValue = months;

  goToStep(2);
}

function submitStep2(event) {
  event.preventDefault();
  clearFieldError(ageInput, ageError);
  clearFieldError(heightInput, heightError);
  clearFieldError(currentWeightInput, currentWeightError);
  formError2.classList.remove('visible');

  const ageRaw = ageInput.value.trim();
  const heightRaw = heightInput.value.trim();
  const weightRaw = currentWeightInput.value.trim();
  const age = parseFloat(ageRaw);
  const height = parseFloat(heightRaw);
  const weight = parseFloat(weightRaw);
  let hasError = false;

  if (ageRaw === '' || isNaN(age) || age <= 0) {
    markInvalid(ageInput, ageError, 'Enter an age above zero.');
    hasError = true;
  }
  if (heightRaw === '' || isNaN(height) || height <= 0) {
    markInvalid(heightInput, heightError, 'Enter a height above zero.');
    hasError = true;
  }
  if (weightRaw === '' || isNaN(weight) || weight <= 0) {
    markInvalid(currentWeightInput, currentWeightError, 'Enter a weight above zero.');
    hasError = true;
  }

  if (hasError) {
    formError2.textContent = 'Fix the fields above to see your results.';
    formError2.classList.add('visible');
    return;
  }

  const gender = document.querySelector('input[name="gender"]:checked').value;
  const activityMultiplier = parseFloat(activitySelect.value);

  const bmr = computeBmr(gender, weight, height, age);
  const tdee = bmr * activityMultiplier;

  renderResults(gender, bmr, tdee);
  goToStep(3);
}

function computeBmr(gender, weight, height, age) {
  return gender === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
}

function renderResults(gender, bmr, tdee) {
  const roundedBmr = Math.round(bmr);
  currentGender = gender;

  statBmr.textContent = roundedBmr.toLocaleString('en-US') + ' kcal';

  tdeeAdjustInput.value = Math.round(tdee);
  weightAdjustInput.value = weightLossLabel;
  updateGoalFromWeight();

  result.classList.add('visible');
}

function updateGoalFromWeight() {
  const weightRaw = weightAdjustInput.value.trim();
  const weightKg = parseFloat(weightRaw);

  if (weightRaw === '' || isNaN(weightKg) || weightKg <= 0) {
    weightAdjustInput.setAttribute('aria-invalid', 'true');
    return;
  }
  weightAdjustInput.removeAttribute('aria-invalid');

  totalCaloriesToLose = weightKg * KCAL_PER_KG;
  dailyDeficit = Math.round(totalCaloriesToLose / (monthsValue * DAYS_PER_MONTH));
  weightLossLabel = weightRaw.replace(/\.0+$/, '');
  weightLossInput.value = weightRaw;

  statDeficit.textContent = dailyDeficit.toLocaleString('en-US') + ' kcal';

  const gaugePercent = Math.min(dailyDeficit, GAUGE_MAX) / GAUGE_MAX * 100;
  gaugeMarker.style.left = gaugePercent + '%';

  warningBanner.classList.toggle('visible', dailyDeficit > AGGRESSIVE_THRESHOLD);

  updateTargetFromTdee();
}

function updateTargetFromTdee() {
  const tdeeRaw = tdeeAdjustInput.value.trim();
  const tdeeValue = parseFloat(tdeeRaw);

  if (tdeeRaw === '' || isNaN(tdeeValue) || tdeeValue <= 0) {
    tdeeAdjustInput.setAttribute('aria-invalid', 'true');
    return;
  }
  tdeeAdjustInput.removeAttribute('aria-invalid');

  const roundedTdee = Math.round(tdeeValue);
  const roundedTarget = Math.round(tdeeValue - dailyDeficit);
  computedTdee = roundedTdee;

  resultNumber.textContent = roundedTarget.toLocaleString('en-US');

  resultSentence.innerHTML =
    'To lose <strong>' + weightLossLabel + ' kg</strong> in <strong>' + monthsLabel +
    (monthsValue === 1 ? ' month' : ' months') + '</strong>, aim for approximately <strong>' +
    roundedTarget.toLocaleString('en-US') + ' kcal</strong> a day — about <strong>' +
    dailyDeficit.toLocaleString('en-US') + ' kcal</strong> below your <strong>' +
    roundedTdee.toLocaleString('en-US') + ' kcal</strong> maintenance level (TDEE).';

  const minIntake = currentGender === 'male' ? 1500 : 1200;
  const isLowIntake = roundedTarget < minIntake;
  lowIntakeText.textContent =
    'Your target of ' + roundedTarget.toLocaleString('en-US') + ' kcal/day falls below the commonly recommended minimum of ' +
    minIntake.toLocaleString('en-US') + ' kcal/day. Very low-calorie diets should only be followed under medical supervision — please consult a doctor or nutritionist before proceeding.';
  lowIntakeBanner.classList.toggle('visible', isLowIntake);
}

step1.addEventListener('submit', submitStep1);
step2.addEventListener('submit', submitStep2);
logForm.addEventListener('submit', submitLogDay);
document.getElementById('back-2').addEventListener('click', () => goToStep(1));
document.getElementById('back-3').addEventListener('click', () => goToStep(2));
exitButton.addEventListener('click', () => {
  if (exitButton.dataset.mode === 'home') {
    goHome();
  } else {
    setConfirming(true);
    keepPlayingButton.focus();
  }
});
confirmEndButton.addEventListener('click', endGame);
keepPlayingButton.addEventListener('click', cancelEndGame);
confirmBox.addEventListener('keydown', event => {
  if (event.key === 'Escape') cancelEndGame();
});
document.getElementById('start-tracker').addEventListener('click', startTracker);
tdeeAdjustInput.addEventListener('input', updateTargetFromTdee);
weightAdjustInput.addEventListener('input', updateGoalFromWeight);

const dayLengthLabel = DAY_LENGTH_MINUTES % 60 === 0
  ? DAY_LENGTH_MINUTES / 60 + (DAY_LENGTH_MINUTES === 60 ? ' hour' : ' hours')
  : DAY_LENGTH_MINUTES + (DAY_LENGTH_MINUTES === 1 ? ' minute' : ' minutes');
document.getElementById('log-hint').textContent =
  'Entries on the same day add together, and maintenance (TDEE) is subtracted once per day. Log at least once every ' +
  dayLengthLabel + ' or the game ends.';

const savedTracker = loadTrackerState();
if (savedTracker) restoreTracker(savedTracker);
