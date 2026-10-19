(function () {
  'use strict';
  const { api, esc, addDays, mondayOf, weekday, todayKey, fmtDate, DAY_LABEL } = L;
  const $ = id => document.getElementById(id);
  let data, selectedDate, mode = 'paper', busy = false, dirty = false;
  let rows = [];
  const printPrefsKey = 'loadout.weekly.print-options';
  let printPrefs;
  try { printPrefs = JSON.parse(localStorage.getItem(printPrefsKey)) || {}; } catch (e) { printPrefs = {}; }
  const excluded = new Set(Array.isArray(printPrefs.excluded) ? printPrefs.excluded.filter(id => typeof id === 'string') : []);
  let showBonuses = printPrefs.showBonuses !== false;
  let extraTasks = (Array.isArray(printPrefs.extraTasks) ? printPrefs.extraTasks : []).filter(q =>
    typeof q.name === 'string' && q.name.trim() && ['simple', 'duration', 'count'].includes(q.kind)
  ).map(q => ({ name: q.name.slice(0, 100), kind: q.kind, paperOnly: true }));
  function savePrintPrefs() {
    try { localStorage.setItem(printPrefsKey, JSON.stringify({ excluded: [...excluded], showBonuses, extraTasks })); } catch (e) {}
  }
  const active = (q, date) => !q.activeDays?.length || q.activeDays.includes(weekday(date));
  const isKey = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && addDays(s, 0) === s;
  const initial = new URLSearchParams(location.search).get('date');
  let week = mondayOf(isKey(initial) ? initial : todayKey());

  function status(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }
  function bonuses(q) {
    return (q.powerUps || []).map(id => data.powerUps.find(p => p.id === id)).filter(Boolean);
  }
  function detail(q) {
    if (q.paperOnly) return (q.kind === 'simple' ? 'Tick when done' : q.kind === 'duration' ? 'Write minutes' : 'Write count') + ' · paper only';
    const frequency = q.cadence === 'weekly' ? (q.timesPerWeek || 1) + '× per week' : 'each active day';
    if (q.kind === 'duration' || q.kind === 'externalXp') return 'Write ' + (q.unitLabel || 'minutes') + ' · target ' + q.target + ' · ' + frequency;
    if (q.kind === 'count') return 'Write number of ' + (q.unitLabel || 'reps') + ' · ' + frequency;
    return 'Tick when done · ' + frequency;
  }
  function paintPrintOptions() {
    const open = $('task-picker')?.open || false;
    $('print-options').innerHTML = '<details id="task-picker"' + (open ? ' open' : '') + '><summary>Choose what to print <span id="print-count"></span></summary>' +
      '<p class="task-detail">Choose any of your enabled chores and quests. These choices only change the paper sheet and are remembered on this device.</p>' +
      '<div class="picker-actions"><button type="button" data-print-all>Include all</button><button type="button" data-print-none>Clear selection</button><a href="/loadout/hq/quests">Manage chores and quests in HQ</a></div>' +
      '<div class="task-picker-list">' + data.quests.map((q, i) => '<label><input type="checkbox" data-print-task="' + i + '"' + (!excluded.has(q.id) ? ' checked' : '') + '>' + esc(q.name) + '</label>').join('') + '</div>' +
      '<label class="bonus-field"><input id="print-bonuses" type="checkbox"' + (showBonuses ? ' checked' : '') + '>Include side quest bonus lines and key</label>' +
      '<h3>Extra tasks for this sheet</h3><p class="task-detail">Extra tasks are tracked on paper only. To log them for rewards, add a quest in HQ.</p>' +
      '<ul class="extra-tasks">' + extraTasks.map((q, i) => '<li><span>' + esc(q.name) + ' <small>(' + (q.kind === 'simple' ? 'tick' : q.kind === 'duration' ? 'minutes' : 'count') + ')</small></span><button type="button" data-remove-extra="' + i + '" aria-label="Remove ' + esc(q.name) + '">Remove</button></li>').join('') + '</ul>' +
      '<form id="extra-task-form"><label>Task name<input id="extra-task-name" type="text" maxlength="100" required placeholder="e.g. Water the plants"></label>' +
      '<label>Record<select id="extra-task-kind"><option value="simple">Done / tick</option><option value="duration">Minutes</option><option value="count">Count</option></select></label><button type="submit">Add to sheet</button></form></details>';
    $('extra-task-form').onsubmit = e => {
      e.preventDefault(); const name = $('extra-task-name').value.trim();
      if (!name) return;
      extraTasks.push({ name, kind: $('extra-task-kind').value, paperOnly: true });
      savePrintPrefs(); paintPrintOptions(); paintPaper(); $('extra-task-name').focus();
    };
  }
  L.on($('print-options'), 'change', '[data-print-task]', (e, input) => {
    const id = data.quests[Number(input.dataset.printTask)].id;
    if (input.checked) excluded.delete(id); else excluded.add(id);
    savePrintPrefs(); paintPaper();
  });
  L.on($('print-options'), 'change', '#print-bonuses', (e, input) => { showBonuses = input.checked; savePrintPrefs(); paintPaper(); });
  L.on($('print-options'), 'click', '[data-print-all], [data-print-none]', (e, button) => {
    for (const q of data.quests) { if (button.hasAttribute('data-print-all')) excluded.delete(q.id); else excluded.add(q.id); }
    savePrintPrefs(); paintPrintOptions(); paintPaper();
  });
  L.on($('print-options'), 'click', '[data-remove-extra]', (e, button) => {
    extraTasks.splice(Number(button.dataset.removeExtra), 1); savePrintPrefs(); paintPrintOptions(); paintPaper();
  });
  function paintPaper() {
    const tasks = [...data.quests.filter(q => !excluded.has(q.id)), ...extraTasks];
    const used = showBonuses ? data.powerUps.filter(p => tasks.some(q => (q.powerUps || []).includes(p.id))) : [];
    const printBonuses = q => showBonuses ? bonuses(q) : [];
    $('print-count').textContent = tasks.length + ' tasks selected';
    $('print').disabled = !tasks.length;
    const codes = new Map(used.map((p, i) => [p.id, String(i + 1)]));
    $('paper').innerHTML = '<div class="sheet"><div class="sheet-head"><div><p class="eyebrow">Loadout / Weekly checklist</p><h2>' +
      fmtDate(week) + ' – ' + fmtDate(data.dates[6]) + ', ' + data.dates[6].slice(0, 4) + '</h2></div><div class="name">' + esc(data.child?.name || '') + '</div></div>' +
      '<p class="sheet-instructions">Tick completed tasks. Write actual minutes or counts, even below the target. A dash means the task is off that day.</p>' +
      '<table><caption class="sr-only">Tasks for the week starting ' + esc(week) + '</caption><thead><tr><th scope="col">Task / what to record</th>' +
      data.dates.map(date => '<th scope="col">' + DAY_LABEL[weekday(date)] + '<span>' + date.slice(5).replace('-', '/') + '</span></th>').join('') + '</tr></thead><tbody>' +
      tasks.map(q => '<tr><th scope="row">' + esc(q.name) + '<small>' + esc(detail(q)) +
        (printBonuses(q).length ? '<br>Side quests: ' + printBonuses(q).map(p => codes.get(p.id)).join(', ') : '') + '</small></th>' +
        data.dates.map(date => '<td>' + (!active(q, date) ? '<span class="off" aria-label="Not scheduled">–</span>' :
          (q.kind === 'simple' ? '<span class="write-box"></span>' : '<span class="write-line"></span>') +
          (printBonuses(q).length ? '<div class="bonus-line">Bonus: ______</div>' : '')) + '</td>').join('') + '</tr>').join('') + '</tbody></table>' +
      (!tasks.length ? '<p>Choose tasks above to build your checklist.</p>' : '') +
      (used.length ? '<div class="bonus-key"><b>Side quests:</b> write the numbers you earned in that task’s Bonus line.<ul>' + used.map(p => '<li><b>' + codes.get(p.id) + '.</b> ' + esc(p.label) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="sheet-footer"><b>At the end of the week:</b> open /loadout/weekly, choose this week, then “Enter from paper”. Save each day on its original date. Leave missed tasks blank. Pack checks use their separate daily slip.' +
      (extraTasks.length ? '<p>Extra paper tasks are tracked on this sheet only.</p>' : '') +
      '<div class="review-line">Entered into Loadout: __________________ &nbsp; Parent checked: __________________</div></div></div>';
  }
  function checkin(q, date) { return (data.days[date]?.checkins || []).find(c => c.questId === q.id); }
  function locked(q, c) {
    return !!c && (c.settledBeforeEconomy || c.status === 'adjusted' || (q.requiresParentConfirm && c.status === 'confirmed'));
  }
  function weekComplete(q) {
    return q.cadence === 'weekly' && data.dates.filter(date => checkin(q, date)?.targetMet).length >= (q.timesPerWeek || 1);
  }
  function paintEntry() {
    rows = data.quests.filter(q => active(q, selectedDate));
    const allowed = selectedDate <= data.today && (data.hq || selectedDate >= data.earliestEntryDate);
    $('entry').innerHTML = '<h2>Bring your paper week back.</h2><p class="intro">Enter one day at a time. Existing entries are shown, and saving adds only any new earnings. Leave tasks you missed blank.</p>' +
      '<label class="entry-day">Day <select id="entry-date">' + data.dates.map(date => '<option value="' + date + '"' + (date === selectedDate ? ' selected' : '') + '>' + fmtDate(date, { long: true }) + '</option>').join('') + '</select></label>' +
      (!allowed ? '<p>' + (selectedDate > data.today ? 'This day hasn’t happened yet. You can print it now and enter it later.' : 'Ask a parent to sign in to HQ to enter a week older than last week, then reload this page.') + '</p>' : '') +
      '<form id="entry-form"><fieldset id="entry-fields"' + (!allowed ? ' disabled' : '') + '>' + rows.map((q, i) => {
        const c = checkin(q, selectedDate), lock = locked(q, c) || (!c && weekComplete(q));
        const paid = c && c.status !== 'pending';
        const valueField = q.kind === 'simple'
          ? '<label class="done-field"><input data-value type="checkbox"' + (c?.value ? ' checked' : '') + (lock || (paid && c.value) ? ' disabled' : '') + '>Done</label>'
          : '<input data-value type="number" inputmode="numeric" min="' + (paid ? c.value : 0) + '" max="' + (q.kind === 'duration' ? 1440 : 100000) + '" step="1" aria-label="' + esc(q.name + ': ' + (q.unitLabel || 'count')) + '" value="' + (c ? c.value : '') + '"' + (lock ? ' disabled' : '') + '>';
        return '<div class="entry-row" data-row="' + i + '"><div class="entry-main"><div><div class="task-name">' + esc(q.name) + '</div><div class="task-detail">' + esc(detail(q)) + '</div></div>' + valueField + '</div>' +
          '<div class="bonus-fields">' + bonuses(q).map((p, j) => '<label class="bonus-field"><input type="checkbox" data-bonus="' + j + '"' + (c?.powerUps?.includes(p.id) ? ' checked' : '') + (lock || (paid && c.powerUps?.includes(p.id)) ? ' disabled' : '') + '>' + esc(p.label) + '</label>').join('') + '</div>' +
          (c ? '<p class="task-status">' + (c.settledBeforeEconomy ? 'Historical entry already settled.' : c.status === 'pending' ? 'Waiting for parent confirmation.' : lock ? 'Reviewed by a parent. Ask them for corrections.' : 'Already logged. You can add to it.') + '</p>' : lock ? '<p class="task-status">Weekly target already logged.</p>' : '') + '</div>';
      }).join('') + (rows.length ? '<div class="entry-actions"><button type="submit">Save ' + esc(DAY_LABEL[weekday(selectedDate)]) + ' entries</button><span class="task-detail">XP and chore money follow the usual rules.</span></div>' : '<p>No tasks scheduled for this day.</p>') + '</fieldset></form>';
    $('entry-date').onchange = e => {
      if (!leaveEdits()) { e.target.value = selectedDate; return; }
      selectedDate = e.target.value; paintEntry(); status('Enter the results for ' + fmtDate(selectedDate) + '.');
    };
    $('entry-form').oninput = () => { dirty = true; };
    $('entry-form').onsubmit = saveDay;
    dirty = false;
  }
  function leaveEdits() { return !dirty || window.confirm('Leave this day without saving your entries?'); }
  function setBusy(value) {
    busy = value;
    for (const id of ['previous', 'next', 'current', 'week-date', 'paper-mode', 'entry-mode', 'entry-date']) if ($(id)) $(id).disabled = value;
  }
  async function load() {
    setBusy(true); $('print').disabled = true; status('Loading your week…');
    $('paper').innerHTML = ''; $('entry').innerHTML = '';
    try {
      data = await api('/week?date=' + week);
      week = data.week; $('week-date').value = week;
      selectedDate = data.today < week ? week : data.today > data.dates[6] ? data.dates[6] : data.today;
      history.replaceState(null, '', '/loadout/weekly?date=' + week);
      paintPrintOptions(); paintPaper(); paintEntry();
      status('Week of ' + fmtDate(week) + '. Print a fresh sheet or enter your results.');
    } catch (e) {
      status('Could not load your week: ' + e.message + ' Choose a week to try again.', true);
    } finally { setBusy(false); }
  }
  async function saveDay(event) {
    event.preventDefault();
    if (busy || !$('entry-form').reportValidity()) return;
    const changes = [];
    for (const [i, q] of rows.entries()) {
      const row = $('entry').querySelector('[data-row="' + i + '"]');
      const c = checkin(q, selectedDate);
      if (locked(q, c) || (!c && weekComplete(q))) continue;
      const field = row.querySelector('[data-value]');
      const value = q.kind === 'simple' ? Number(field.checked) : field.value === '' ? (c?.value || 0) : Number(field.value);
      const powerUps = bonuses(q).filter((p, j) => row.querySelector('[data-bonus="' + j + '"]').checked).map(p => p.id);
      if (q.kind === 'simple' && !value && powerUps.length) { status('Tick Done for ' + q.name + ' before adding its bonuses.', true); return; }
      if (!c && !value && !powerUps.length) continue;
      if (c && value === c.value && JSON.stringify([...powerUps].sort()) === JSON.stringify([...(c.powerUps || [])].sort())) continue;
      changes.push({ q, value, powerUps });
    }
    if (!changes.length) { status('No new entries to save for ' + fmtDate(selectedDate) + '.'); dirty = false; return; }
    setBusy(true); $('entry-fields').disabled = true;
    let saved = 0;
    try {
      for (const { q, value, powerUps } of changes) {
        status('Saving ' + q.name + '…');
        const result = await api('/day/' + selectedDate + '/checkin', { method: 'POST', body: {
          questId: q.id, value, powerUps, focusMinutes: checkin(q, selectedDate)?.focusMinutes || 0,
        } });
        data.days[selectedDate] = result.day;
        saved++;
      }
      paintEntry();
      status('Saved ' + saved + ' ' + (saved === 1 ? 'entry' : 'entries') + ' for ' + fmtDate(selectedDate) + '. Choose another day to continue.');
    } catch (e) {
      // Keep the form intact: successful requests are now in data.days, so a retry
      // skips them and retains unsaved values for the remaining tasks.
      status(saved + ' saved. Could not save ' + changes[saved].q.name + ': ' + e.message + ' Your remaining entries are still here; you can retry.', true);
    } finally { setBusy(false); $('entry-fields').disabled = false; }
  }
  function changeWeek(date) {
    if (busy || !isKey(date) || !leaveEdits()) { $('week-date').value = week; return; }
    dirty = false; week = mondayOf(date); load();
  }
  $('previous').onclick = () => changeWeek(addDays(week, -7));
  $('next').onclick = () => changeWeek(addDays(week, 7));
  $('current').onclick = () => changeWeek(todayKey());
  $('week-date').onchange = e => changeWeek(e.target.value);
  function setMode(nextMode) {
    mode = nextMode; $('paper').hidden = mode !== 'paper'; $('entry').hidden = mode !== 'entry';
    $('print-options').hidden = mode !== 'paper';
    $('paper-mode').setAttribute('aria-pressed', String(mode === 'paper'));
    $('entry-mode').setAttribute('aria-pressed', String(mode === 'entry'));
  }
  $('paper-mode').onclick = () => setMode('paper');
  $('entry-mode').onclick = () => setMode('entry');
  $('print').onclick = () => window.print();
  window.addEventListener('beforeunload', e => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
