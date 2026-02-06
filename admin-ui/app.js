// Настройки (пока хардкодим локально для v1 dev)
const API_BASE = 'http://127.0.0.1:3001';

// Плейсхолдер превью (без фото-логики на этом этапе)
function renderThumb(el) {
  el.innerHTML = '<div>no photo</div>';
}

function qs(id) { return document.getElementById(id); }

function setApiBadgeOk() {
  const b = qs('apiBadge');
  b.classList.remove('badge--muted');
  b.classList.add('badge--ok');
  b.textContent = `API: ${API_BASE}`;
}

function setApiBadgeUnknown() {
  const b = qs('apiBadge');
  b.classList.add('badge--muted');
  b.classList.remove('badge--ok');
  b.textContent = `API: недоступно`;
}

function showError(errObj) {
  const box = qs('errorBox');
  const text = qs('errorText');
  box.classList.remove('hidden');
  text.textContent = JSON.stringify(errObj, null, 2);
}

function hideError() {
  qs('errorBox').classList.add('hidden');
  qs('errorText').textContent = '';
}

function setCount(n) {
  qs('countText').textContent = `Всего: ${n}`;
}

function setEmpty(isEmpty) {
  qs('emptyState').classList.toggle('hidden', !isEmpty);
}

function renderList(cars) {
  const list = qs('list');
  list.innerHTML = '';

  cars.forEach((car) => {
    const item = document.createElement('div');
    item.className = 'item';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    renderThumb(thumb);

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `${car.brand ?? ''} ${car.model ?? ''}`.trim() || '(без названия)';

    const sub = document.createElement('div');
    sub.className = 'sub';
    const year = car.year ? String(car.year) : '—';
    const country = car.country ?? '—';
    sub.textContent = `${year} • ${country} • id: ${car.id ?? '—'}`;

    info.appendChild(title);
    info.appendChild(sub);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const price = (car.price ?? null);
    meta.textContent = price === null ? '—' : `${price.toLocaleString('ru-RU')} ₽`;

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(meta);

    list.appendChild(item);
  });
}

async function fetchCars() {
  const r = await fetch(`${API_BASE}/cars`, { method: 'GET' });

  // Если сервер вернул 4xx/5xx — пробуем прочитать JSON ошибки
  const text = await r.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

  if (!r.ok) {
    throw payload;
  }
  return payload;
}

async function refresh() {
  hideError();

  try {
    // проверяем что API жив
    await fetch(`${API_BASE}/health`, { method: 'GET' });
    setApiBadgeOk();

    const data = await fetchCars();
    const cars = Array.isArray(data?.cars) ? data.cars : [];

    setCount(cars.length);
    setEmpty(cars.length === 0);
    renderList(cars);
  } catch (e) {
    setApiBadgeUnknown();
    setCount(0);
    setEmpty(true);
    renderList([]);
    showError(e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('btnRefresh').addEventListener('click', refresh);
  refresh();
});
