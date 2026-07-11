const {articleNames, articles, typeNames, levelNames, levelLabels} = window.KZ_DATA;

const modifierOptions = {
  intent: [['aware', 'Осознано'], ['careless', 'Неосторожность']],
  finish: [['complete', 'Окончено или покушение'], ['stopped', 'Добровольная остановка']],
  ready: [['planned', 'Предварительный план'], ['affect', 'Аффект'], ['conspiracy', 'Заговор']],
  reason: [['none', 'Без модификатора'], ['necessity', 'Крайняя необходимость: смягчить'], ['necessity-none', 'Крайняя необходимость: снять наказание'], ['assistance', 'Содействие следствию'], ['official', 'Должностным лицом / против него']]
};

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeText = value => String(value).toLowerCase().replaceAll('ё', 'е');

const emptyMessages = [
  'Спокойно, шериф. Дел нет.',
  'Спи, солдат. Всё тихо.',
  'Всё путём, ковбой.',
  'Здесь ничего не происходит.',
  'Тишина. Мир спит.',
  'Станция в порядке.',
  'Никаких происшествий.'
];
const getRandomMessage = () => emptyMessages[Math.floor(Math.random() * emptyMessages.length)];

function loadArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeCharge(saved) {
  const article = articles.find(item => item.code === String(saved.code));
  if (!article) return null;
  return {
    ...article,
    intent: saved.intent === -1 || saved.intent === 'careless' ? 'careless' : 'aware',
    finish: saved.finish === -1 || saved.finish === 'stopped' ? 'stopped' : 'complete',
    ready: saved.ready === -1 || saved.ready === 'affect' ? 'affect' : saved.ready === 1 || saved.ready === 'conspiracy' ? 'conspiracy' : 'planned',
    reason: saved.reason === -9 || saved.reason === 'necessity-none' ? 'necessity-none' : saved.reason === -1 || saved.reason === 'necessity' ? 'necessity' : saved.reason === 1 || saved.reason === 'official' ? 'official' : saved.reason === 'assistance' ? 'assistance' : 'none',
    repeat: clamp(Number(saved.repeat) || 1, 1, 5)
  };
}

let state = loadArray('kz-case').map(normalizeCharge).filter(Boolean);
let filter = 0;
let baseTerm = clamp(Number(localStorage.getItem('kz-base-term')) || 15, 15, 45);
let lastOpened = '';
let layoutMode = localStorage.getItem('kz-layout') === 'stack' ? 'stack' : 'split';
let layoutSwitching = false;

function save() {
  localStorage.setItem('kz-case', JSON.stringify(state));
  localStorage.setItem('kz-base-term', String(baseTerm));
}

function severityStyle(level) {
  return `style="--severity:var(--x${level});--severity-bg:var(--x${level}-bg)"`;
}

function matches(article, query) {
  const haystack = normalizeText(`${article.code} ${article.name} ${article.description} ${typeNames[article.type - 1]}`);
  return haystack.includes(normalizeText(query));
}

function renderFilters() {
  const options = [
    ['0', 'Все'], ['1', 'X1'], ['2', 'X2'], ['3', 'X3'], ['4', 'X4'], ['5', 'X5'],
    ['selected', `Выбранные${state.length ? ` · ${state.length}` : ''}`]
  ];
  $('#filters').innerHTML = options.map(([value, label]) => {
    const active = String(filter) === value;
    return `<button class="filter-button${value === 'selected' ? ' selected-filter' : ''}${active ? ' active' : ''}" type="button" data-filter="${value}" aria-pressed="${active}">${label}</button>`;
  }).join('');
}

function applyLayout() {
  const workspace = $('.workspace');
  workspace.classList.toggle('layout-stack', layoutMode === 'stack');
  workspace.classList.toggle('layout-split', layoutMode === 'split');
  document.querySelectorAll('[data-layout]').forEach(button => {
    const active = button.dataset.layout === layoutMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  localStorage.setItem('kz-layout', layoutMode);
}

function setLayout(nextLayout) {
  if (nextLayout === layoutMode || layoutSwitching) return;
  const update = () => {
    layoutMode = nextLayout;
    applyLayout();
  };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    update();
    return;
  }

  const workspace = $('.workspace');
  layoutSwitching = true;
  workspace.classList.add('layout-fading');

  window.setTimeout(() => {
    update();
    requestAnimationFrame(() => {
      workspace.classList.remove('layout-fading');
      window.setTimeout(() => { layoutSwitching = false; }, 170);
    });
  }, 120);
}

function articleButton(article) {
  const selected = state.some(charge => charge.code === article.code);
  return `<button class="article-card${selected ? ' selected' : ''}" type="button" data-code="${article.code}" aria-pressed="${selected}" title="${esc(article.description)}" ${severityStyle(article.level)}>
    <span class="article-code">${article.code}</span>
    <span class="article-name">${esc(article.name)}</span>
    <span class="check" aria-hidden="true">✓</span>
  </button>`;
}

function renderMatrix() {
  const headings = levelLabels.slice(1).map((label, index) => `<div class="severity-heading" ${severityStyle(index + 1)}><b>${label}</b><span>${levelNames[index + 1]}</span></div>`).join('');
  const rows = articleNames.map((row, rowIndex) => {
    const cells = row.map((_, levelIndex) => articleButton(articles.find(article => article.code === `${rowIndex + 1}${levelIndex + 1}`))).join('');
    return `<div class="type-heading"><b>${rowIndex + 1}X</b><span>${typeNames[rowIndex]}</span></div>${cells}`;
  }).join('');
  return `<div class="law-matrix"><div class="matrix-corner">Тип</div>${headings}${rows}</div>`;
}

function renderSearchResults(query) {
  const visible = articles.filter(article => {
    if (filter === 'selected' && !state.some(charge => charge.code === article.code)) return false;
    if (typeof filter === 'number' && filter && article.level !== filter) return false;
    return matches(article, query);
  });
  if (!visible.length) return '<div class="no-results"><b>Ничего не найдено</b><span>Попробуйте другой номер или формулировку.</span></div>';
  return `<div class="results-mode">${visible.map(article => {
    const selected = state.some(charge => charge.code === article.code);
    return `<button class="result-article${selected ? ' selected' : ''}" type="button" data-code="${article.code}" aria-pressed="${selected}" ${severityStyle(article.level)}>
      <span class="code-badge">${article.code}</span>
      <span><strong>${esc(article.name)}</strong><p>${esc(article.description)}</p></span>
      <span class="result-check" aria-hidden="true">${selected ? '✓' : '+'}</span>
    </button>`;
  }).join('')}</div>`;
}

function renderArticles() {
  const query = $('#search').value.trim();
  $('#articles').innerHTML = query || filter ? renderSearchResults(query) : renderMatrix();
  renderFilters();
}

function selectMarkup(field, current) {
  return `<select data-field="${field}">${modifierOptions[field].map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
}

function modifierDelta(charge) {
  const intent = charge.intent === 'careless' ? -1 : 0;
  const finish = charge.finish === 'stopped' ? -1 : 0;
  const ready = charge.ready === 'affect' ? -1 : charge.ready === 'conspiracy' ? 1 : 0;
  const reason = charge.reason === 'necessity' ? -1 : charge.reason === 'necessity-none' ? -99 : charge.reason === 'official' ? 1 : 0;
  return intent + finish + ready + reason;
}

function effectiveLevel(charge) {
  if (charge.reason === 'necessity-none') return 0;
  return clamp(charge.level + modifierDelta(charge) + Math.max(0, charge.repeat - 1), 1, 5);
}

function levelShiftMarkup(charge) {
  const effective = effectiveLevel(charge);
  if (!effective) return '<span class="level-shift changed">снята</span>';
  const changed = effective !== charge.level;
  return changed ? `<span class="level-shift changed">X${charge.level} → X${effective}</span>` : '';
}

function renderCharges() {
  $('#empty').hidden = Boolean(state.length);
  $('#emptyTitle').textContent = getRandomMessage();
  $('#clear').disabled = !state.length;
  $('#charges').innerHTML = state.map(charge => `<details class="charge" data-code="${charge.code}" ${charge.code === lastOpened ? 'open' : ''} ${severityStyle(charge.level)}>
    <summary>
      <span class="charge-code">${charge.code}</span>
      <span class="charge-name"><b>${esc(charge.name)}</b><small>${levelNames[charge.level]} нарушение</small></span>
      ${levelShiftMarkup(charge)}
      <button class="remove" type="button" data-remove="${charge.code}" aria-label="Удалить статью ${charge.code}" title="Удалить">×</button>
    </summary>
    <div class="charge-body">
      <p class="charge-description">${esc(charge.description)}</p>
      <div class="mods">
        <label>Умысел${selectMarkup('intent', charge.intent)}</label>
        <label>Завершённость${selectMarkup('finish', charge.finish)}</label>
        <label>Готовность${selectMarkup('ready', charge.ready)}</label>
        <label>Намерения${selectMarkup('reason', charge.reason)}</label>
      </div>
      <div class="repeat-control">
        <label>Нарушений этой статьи<span>Повтор повышает тяжесть</span></label>
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="Уменьшить">-</button>
          <input type="number" data-field="repeat" min="1" max="5" value="${charge.repeat}" aria-label="Количество нарушений статьи ${charge.code}">
          <button type="button" data-step="1" aria-label="Увеличить">+</button>
        </div>
      </div>
    </div>
  </details>`).join('');
  calculate();
  renderArticles();
}

function updateChargeLevels() {
  state.forEach(charge => {
    const details = document.querySelector(`.charge[data-code="${charge.code}"]`);
    const oldBadge = details?.querySelector('.level-shift');
    if (oldBadge) oldBadge.outerHTML = levelShiftMarkup(charge);
  });
}

function calculate() {
  const active = state.map(charge => ({...charge, effective: effectiveLevel(charge)})).filter(charge => charge.effective).sort((a, b) => b.effective - a.effective);
  const byTypeMap = new Map();
  active.forEach(charge => {
    if (!byTypeMap.has(charge.type)) byTypeMap.set(charge.type, charge);
  });
  const byType = [...byTypeMap.values()];
  const highest = Math.max(0, ...byType.map(charge => charge.effective));
  const main = byType.find(charge => charge.effective === highest);
  const additions = highest === 3 || highest === 4
    ? byType.filter(charge => charge !== main).reduce((total, charge) => total + ([0, 0, 5, 10, 15, 0][charge.effective] || 0), 0)
    : 0;

  let result = '--';
  let status = 'Добавьте статьи';
  let disciplinary = '';

  if (state.length && !highest) {
    result = 'Обвинения сняты';
    status = 'Нет активных статей';
  } else if (highest === 1) {
    result = 'Без заключения';
    status = 'Незначительное нарушение';
    disciplinary = 'Предупреждение и профилактическая беседа';
  } else if (highest === 2) {
    result = 'Без заключения';
    status = 'Лёгкое нарушение';
    disciplinary = 'Объяснительная и профилактическая беседа';
  } else if (highest === 5) {
    result = 'До отправки на ЦК';
    status = 'Обязательное задержание';
    disciplinary = 'Отстранение от должности';
  } else if (highest === 3 || highest === 4) {
    const min = highest === 3 ? 15 : 30;
    const max = highest === 3 ? 25 : 45;
    baseTerm = clamp(baseTerm, min, max);
    $('#baseTerm').min = min;
    $('#baseTerm').max = max;
    $('#baseTerm').value = baseTerm;
    $('#termMin').textContent = `${min} мин`;
    $('#termMax').textContent = `${max} мин`;
    $('#termValue').textContent = `${baseTerm} мин`;
    result = `${baseTerm + additions} минут`;
    status = `${levelNames[highest]} правонарушение`;
    disciplinary = 'До отстранения от должности';
  }

  $('#termChoice').style.display = highest === 3 || highest === 4 ? 'block' : 'none';
  $('#verdict').innerHTML = `<div class="verdict"><span class="verdict-status">${esc(status)}</span><div class="verdict-value">${esc(result)}</div><span class="verdict-main">${main ? `Основная статья ${main.code}` : 'Расчёт обновляется автоматически'}</span></div>`;

  const ignored = active.length - byType.length;
  const total = highest === 3 || highest === 4 ? baseTerm + additions : 0;
  const rows = [
    main && `<div class="breakdown-row"><span>Основная статья</span><span>${main.code} · X${main.effective}</span></div>`,
    additions > 0 && `<div class="breakdown-row"><span>Дополнительные статьи</span><span>+${additions} минут</span></div>`,
    disciplinary && `<div class="breakdown-row"><span>Дисциплинарно</span><span>${disciplinary}</span></div>`,
    ignored > 0 && `<div class="breakdown-row"><span>Один тип</span><span>${ignored} ${ignored === 1 ? 'статья не суммируется' : 'статьи не суммируются'}</span></div>`,
    total >= 40 && highest < 5 && '<div class="warning">Срок 40+ минут: допускается отбывание наказания в пермабриге.</div>'
  ].filter(Boolean);
  $('#breakdown').innerHTML = rows.join('');
  updateChargeLevels();
  save();
  window.calculation = {active, byType, highest, main, additions, result, status, disciplinary};
}

function toggleArticle(code) {
  const index = state.findIndex(charge => charge.code === code);
  if (index >= 0) {
    state.splice(index, 1);
    if (lastOpened === code) lastOpened = '';
  } else {
    const article = articles.find(item => item.code === code);
    state.push(normalizeCharge(article));
    lastOpened = code;
  }
  save();
  renderCharges();
}

function updateCharge(code, field, value) {
  const charge = state.find(item => item.code === code);
  if (!charge) return;
  charge[field] = field === 'repeat' ? clamp(Number(value) || 1, 1, 5) : value;
  save();
  calculate();
}

$('#filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  filter = button.dataset.filter === 'selected' ? 'selected' : Number(button.dataset.filter);
  renderArticles();
});

$('#layoutToggle').addEventListener('click', event => {
  const button = event.target.closest('[data-layout]');
  if (!button) return;
  setLayout(button.dataset.layout);
});

$('#search').addEventListener('input', renderArticles);
$('#articles').addEventListener('click', event => {
  const button = event.target.closest('[data-code]');
  if (button) toggleArticle(button.dataset.code);
});

$('#charges').addEventListener('click', event => {
  const details = event.target.closest('.charge');
  if (!details) return;
  if (event.target.closest('[data-remove]')) {
    event.preventDefault();
    toggleArticle(details.dataset.code);
    return;
  }
  const step = event.target.closest('[data-step]');
  if (step) {
    const charge = state.find(item => item.code === details.dataset.code);
    updateCharge(details.dataset.code, 'repeat', charge.repeat + Number(step.dataset.step));
    const input = details.querySelector('[data-field="repeat"]');
    if (input) input.value = charge.repeat;
  }
});

$('#charges').addEventListener('toggle', event => {
  if (event.target.matches('.charge') && event.target.open) lastOpened = event.target.dataset.code;
}, true);

$('#charges').addEventListener('change', event => {
  const details = event.target.closest('.charge');
  if (details && event.target.dataset.field) updateCharge(details.dataset.code, event.target.dataset.field, event.target.value);
});

$('#clear').addEventListener('click', () => {
  state = [];
  lastOpened = '';
  save();
  renderCharges();
});

$('#baseTerm').addEventListener('input', event => {
  baseTerm = Number(event.target.value);
  calculate();
});

document.addEventListener('keydown', event => {
  const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (event.key === '/' && !editing) {
    event.preventDefault();
    $('#search').focus();
  }
  if (event.key === 'Escape' && document.activeElement === $('#search')) {
    $('#search').value = '';
    renderArticles();
    $('#search').blur();
  }
});

applyLayout();
renderFilters();
renderCharges();
