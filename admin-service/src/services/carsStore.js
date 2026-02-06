import fs from 'fs/promises';
import path from 'path';

function carsJsonPath(dataRoot) {
  return path.resolve(dataRoot, 'cars.json');
}

function carsTmpPath(dataRoot) {
  return path.resolve(dataRoot, 'cars.json.tmp');
}

function carsSwapPath(dataRoot) {
  return path.resolve(dataRoot, 'cars.json.swap');
}

function carsLockPath(dataRoot) {
  return path.resolve(dataRoot, 'cars.lock');
}

function assetsCarsDir(dataRoot) {
  return path.resolve(dataRoot, 'assets', 'cars');
}

function backupFileName() {
  // Windows-safe ISO
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `cars.json.bak.${ts}`;
}

function makeErr(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

async function fileExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

async function readTextIfExists(p) {
  try {
    return await fs.readFile(p, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function parseCarsJson(raw) {
  if (raw == null) return null;

  // Пустой файл трактуем как []
  if (raw.trim().length === 0) return [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw makeErr(
      500,
      'CARS_JSON_INVALID',
      `cars.json is not valid JSON: ${err?.message || String(err)}`
    );
  }

  if (!Array.isArray(data)) {
    throw makeErr(500, 'CARS_JSON_WRONG_SHAPE', 'cars.json must be an array of cars');
  }

  return data;
}

async function listBackups(dataRoot) {
  const entries = await fs.readdir(dataRoot, { withFileTypes: true });
  const items = [];

  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.startsWith('cars.json.bak.')) continue;
    const full = path.resolve(dataRoot, e.name);
    try {
      const st = await fs.stat(full);
      items.push({ path: full, mtimeMs: st.mtimeMs });
    } catch {
      // ignore
    }
  }

  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items;
}

async function pruneBackups(env) {
  if (env.MAX_BACKUPS <= 0) return;

  const backups = await listBackups(env.DATA_ROOT);
  const toDelete = backups.slice(env.MAX_BACKUPS);

  await Promise.allSettled(toDelete.map(b => fs.unlink(b.path)));
}

async function acquireWriteLock(env) {
  const lockPath = carsLockPath(env.DATA_ROOT);

  const tryCreate = async () => {
    const handle = await fs.open(lockPath, 'wx'); // create only if not exists
    try {
      const payload = JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString()
      });
      await handle.writeFile(payload, 'utf-8');
    } finally {
      await handle.close();
    }
  };

  try {
    await tryCreate();
  } catch (err) {
    if (!(err && err.code === 'EEXIST')) {
      throw makeErr(500, 'STORE_LOCK_IO_ERROR', `Failed to create lock: ${err?.message || String(err)}`);
    }

    // lock exists -> TTL check
    try {
      const st = await fs.stat(lockPath);
      const ageMs = Date.now() - st.mtimeMs;

      if (ageMs > env.LOCK_TTL_MS) {
        await fs.unlink(lockPath);
        await tryCreate();
      } else {
        throw makeErr(409, 'STORE_LOCKED', 'Store is locked by another operation');
      }
    } catch (e) {
      if (e?.code === 'STORE_LOCKED' || e?.code === 'STORE_LOCK_IO_ERROR') throw e;
      throw makeErr(500, 'STORE_LOCK_CHECK_FAILED', `Failed to check lock: ${e?.message || String(e)}`);
    }
  }

  return async () => {
    try {
      await fs.unlink(lockPath);
    } catch {
      // ignore
    }
  };
}

async function safeReplaceFile(dataRoot, tmpPath, finalPath) {
  const swapPath = carsSwapPath(dataRoot);

  const finalExists = await fileExists(finalPath);
  const swapExists = await fileExists(swapPath);

  if (swapExists && finalExists) {
    await fs.unlink(swapPath).catch(() => {});
  }

  if (finalExists) {
    await fs.rename(finalPath, swapPath);
  }

  await fs.rename(tmpPath, finalPath);
  await fs.unlink(swapPath).catch(() => {});
}

async function ensureConsistency(env) {
  const dataRoot = env.DATA_ROOT;
  const finalPath = carsJsonPath(dataRoot);
  const swapPath = carsSwapPath(dataRoot);

  const finalExists = await fileExists(finalPath);
  const swapExists = await fileExists(swapPath);

  // crashed between rename(final->swap) and rename(tmp->final)
  if (!finalExists && swapExists) {
    await fs.rename(swapPath, finalPath);
  }
}

async function backupCurrent(env) {
  const dataRoot = env.DATA_ROOT;
  const finalPath = carsJsonPath(dataRoot);

  const exists = await fileExists(finalPath);
  if (!exists) return;

  // НЕ бэкапим пустой файл (0 байт)
  const st = await fs.stat(finalPath);
  if (st.size === 0) return;

  const backupPath = path.resolve(dataRoot, backupFileName());
  await fs.copyFile(finalPath, backupPath);
  await pruneBackups(env);
}

async function writeCarsAtomically(env, carsArray) {
  if (!Array.isArray(carsArray)) {
    throw makeErr(500, 'CARS_JSON_WRONG_SHAPE', 'cars.json must be an array of cars');
  }

  const dataRoot = env.DATA_ROOT;
  const finalPath = carsJsonPath(dataRoot);
  const tmpPath = carsTmpPath(dataRoot);

  const payload = JSON.stringify(carsArray, null, 2) + '\n';
  await fs.writeFile(tmpPath, payload, 'utf-8');

  if (env.MAX_BACKUPS > 0) {
    await backupCurrent(env);
  }

  await safeReplaceFile(dataRoot, tmpPath, finalPath);
}

async function restoreFromLatestBackup(env) {
  if (env.MAX_BACKUPS <= 0) return false;

  const backups = await listBackups(env.DATA_ROOT);
  if (!backups.length) return false;

  const finalPath = carsJsonPath(env.DATA_ROOT);

  for (const b of backups) {
    await fs.copyFile(b.path, finalPath);

    const raw = await fs.readFile(finalPath, 'utf-8');
    if (raw.trim().length === 0) continue; // пустой backup не считаем восстановлением

    try {
      const parsed = parseCarsJson(raw);
      if (Array.isArray(parsed)) return true;
    } catch {
      // try next
    }
  }

  return false;
}

async function initIfMissingOrEmpty(env) {
  const filePath = carsJsonPath(env.DATA_ROOT);
  const exists = await fileExists(filePath);

  if (!exists) {
    await writeCarsAtomically(env, []);
    return;
  }

  const raw = await readTextIfExists(filePath);
  if (raw != null && raw.trim().length === 0) {
    await writeCarsAtomically(env, []);
  }
}

export async function withWriteLock(env, fn) {
  const release = await acquireWriteLock(env);
  try {
    await ensureConsistency(env);
    await initIfMissingOrEmpty(env);

    return await fn();
  } finally {
    await release();
  }
}


async function readCarsNoLock(env) {
  const filePath = carsJsonPath(env.DATA_ROOT);

  await ensureConsistency(env);

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return [];
    }
    throw makeErr(500, 'CARS_JSON_READ_FAILED', `Failed to read cars.json: ${err?.message || String(err)}`);
  }

  return parseCarsJson(raw) ?? [];
}

export async function readCars(env) {
  const filePath = carsJsonPath(env.DATA_ROOT);

  try {
    await ensureConsistency(env);
  } catch (err) {
    throw makeErr(500, 'CARS_STORE_CONSISTENCY_FAILED', `Failed to ensure consistency: ${err?.message || String(err)}`);
  }

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      await withWriteLock(env, async () => {
        await initIfMissingOrEmpty(env);
      });
      return [];
    }
    throw makeErr(500, 'CARS_JSON_READ_FAILED', `Failed to read cars.json: ${err?.message || String(err)}`);
  }

  try {
    const data = parseCarsJson(raw);
    // если файл был пустой — нормализуем
    if (Array.isArray(data) && raw.trim().length === 0) {
      await withWriteLock(env, async () => {
        await initIfMissingOrEmpty(env);
      });
    }
    return data ?? [];
  } catch (err) {
    if (err?.code === 'CARS_JSON_INVALID') {
      await withWriteLock(env, async () => {
        const restored = await restoreFromLatestBackup(env);
        if (!restored) {
          await writeCarsAtomically(env, []);
        }
      });

      const fixedRaw = await fs.readFile(filePath, 'utf-8');
      const fixedData = parseCarsJson(fixedRaw);
      return fixedData ?? [];
    }

    if (err?.status && err?.code) throw err;
    throw makeErr(500, 'CARS_STORE_READ_FAILED', `Failed to parse/read store: ${err?.message || String(err)}`);
  }
}

export async function readCarById(env, id) {
  const cars = await readCars(env);
  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    throw makeErr(400, 'INVALID_ID', 'Invalid id');
  }

  const car = cars.find(c => Number(c?.id) === numericId);
  return car || null;
}

/* ===========================
   ЭТАП D: CRUD (без фото)
   =========================== */

function slugPart(value) {
  const s = String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[\s-]+/g, '_')         // spaces/hyphens -> _
    .replace(/[^a-z0-9_]/g, '')      // remove спецсимволы/кириллицу
    .replace(/_+/g, '_')             // collapse
    .replace(/^_+|_+$/g, '');        // trim _
  return s.length ? s : 'x';
}

function validateRequiredCreate(payload) {
  const errors = [];

  const brand = payload?.brand;
  const model = payload?.model;
  const year = payload?.year;
  const price = payload?.price;
  const country = payload?.country;

  if (typeof brand !== 'string' || brand.trim().length === 0) errors.push('brand is required');
  if (typeof model !== 'string' || model.trim().length === 0) errors.push('model is required');

  const y = Number(year);
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(y) || y < 1900 || y > currentYear + 1) errors.push('year is required and must be a valid year');

  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) errors.push('price is required and must be >= 0');

  const allowedCountries = new Set(['KR', 'CN', 'RU']);
  if (typeof country !== 'string' || !allowedCountries.has(country)) errors.push('country must be one of KR|CN|RU');

  // optional numeric
  if (payload?.engine_volume != null) {
    const ev = Number(payload.engine_volume);
    if (!Number.isFinite(ev) || ev <= 0) errors.push('engine_volume must be > 0 if provided');
  }

  if (errors.length) {
    throw makeErr(400, 'VALIDATION_ERROR', errors.join('; '));
  }

  return {
    brand: brand.trim(),
    model: model.trim(),
    year: y,
    price: p,
    country
  };
}

function validatePatch(patch) {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw makeErr(400, 'VALIDATION_ERROR', 'patch must be an object');
  }

  if ('id' in patch) throw makeErr(400, 'READONLY_FIELD', 'id is readonly');
  if ('assets_folder' in patch) throw makeErr(400, 'READONLY_FIELD', 'assets_folder is readonly');
  if ('photos' in patch) throw makeErr(400, 'READONLY_FIELD', 'photos is readonly (stage E)');

  if ('brand' in patch) {
    if (typeof patch.brand !== 'string' || patch.brand.trim().length === 0) {
      throw makeErr(400, 'VALIDATION_ERROR', 'brand must be a non-empty string');
    }
  }

  if ('model' in patch) {
    if (typeof patch.model !== 'string' || patch.model.trim().length === 0) {
      throw makeErr(400, 'VALIDATION_ERROR', 'model must be a non-empty string');
    }
  }

  if ('year' in patch) {
    const y = Number(patch.year);
    const currentYear = new Date().getFullYear();
    if (!Number.isFinite(y) || y < 1900 || y > currentYear + 1) {
      throw makeErr(400, 'VALIDATION_ERROR', 'year must be a valid year');
    }
  }

  if ('price' in patch) {
    const p = Number(patch.price);
    if (!Number.isFinite(p) || p < 0) {
      throw makeErr(400, 'VALIDATION_ERROR', 'price must be >= 0');
    }
  }

  if ('country' in patch) {
    const allowedCountries = new Set(['KR', 'CN', 'RU']);
    if (typeof patch.country !== 'string' || !allowedCountries.has(patch.country)) {
      throw makeErr(400, 'VALIDATION_ERROR', 'country must be one of KR|CN|RU');
    }
  }

  if ('engine_volume' in patch && patch.engine_volume != null) {
    const ev = Number(patch.engine_volume);
    if (!Number.isFinite(ev) || ev <= 0) {
      throw makeErr(400, 'VALIDATION_ERROR', 'engine_volume must be > 0 if provided');
    }
  }
}

function nextId(cars) {
  let max = 0;
  for (const c of cars) {
    const n = Number(c?.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

async function ensureAssetsFolder(env, folder) {
  const base = assetsCarsDir(env.DATA_ROOT);
  await fs.mkdir(base, { recursive: true });

  const full = path.resolve(base, folder);
  await fs.mkdir(full, { recursive: true });
}

export async function createCar(env, payload) {
  const req = validateRequiredCreate(payload);

  return withWriteLock(env, async () => {
    const cars = await readCarsNoLock(env);

    const id = nextId(cars);
    const folder = `${id}_${slugPart(req.brand)}_${slugPart(req.model)}_${req.year}`;

    const car = {
      ...payload,
      id,
      assets_folder: folder,
      photos: [] // stage E
    };

    // гарантируем required (нормализованные)
    car.brand = req.brand;
    car.model = req.model;
    car.year = req.year;
    car.price = req.price;
    car.country = req.country;

    // не позволяем подложить readonly
    delete car.id; // пересоздадим ниже
    delete car.assets_folder;
    delete car.photos;

    car.id = id;
    car.assets_folder = folder;
    car.photos = [];

    await ensureAssetsFolder(env, folder);

    const updated = [...cars, car];
    await writeCarsAtomically(env, updated);

    return car;
  });
}

export async function updateCar(env, id, patch) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    throw makeErr(400, 'INVALID_ID', 'Invalid id');
  }

  validatePatch(patch);

  return withWriteLock(env, async () => {
    const cars = await readCarsNoLock(env);
    const idx = cars.findIndex(c => Number(c?.id) === numericId);

    if (idx === -1) {
      throw makeErr(404, 'NOT_FOUND', 'Car not found');
    }

    const existing = cars[idx];

    const updatedCar = {
      ...existing,
      ...patch
    };

    // защита readonly
    updatedCar.id = existing.id;
    updatedCar.assets_folder = existing.assets_folder;
    updatedCar.photos = existing.photos;

    // нормализация строк
    if ('brand' in patch) updatedCar.brand = String(patch.brand).trim();
    if ('model' in patch) updatedCar.model = String(patch.model).trim();

    // нормализация чисел
    if ('year' in patch) updatedCar.year = Number(patch.year);
    if ('price' in patch) updatedCar.price = Number(patch.price);
    if ('engine_volume' in patch && patch.engine_volume != null) updatedCar.engine_volume = Number(patch.engine_volume);

    // country оставляем строкой
    const nextCars = cars.slice();
    nextCars[idx] = updatedCar;

    await writeCarsAtomically(env, nextCars);

    return updatedCar;
  });
}

export async function deleteCar(env, id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    throw makeErr(400, 'INVALID_ID', 'Invalid id');
  }

  return withWriteLock(env, async () => {
    const cars = await readCarsNoLock(env);
    const before = cars.length;
    const remaining = cars.filter(c => Number(c?.id) !== numericId);

    if (remaining.length === before) {
      throw makeErr(404, 'NOT_FOUND', 'Car not found');
    }

    // На этапе D НЕ трогаем файлы/папки (это этап E/политика очистки)
    await writeCarsAtomically(env, remaining);
    return { deleted: 1 };
  });
}

export async function bulkDeleteCars(env, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw makeErr(400, 'VALIDATION_ERROR', 'ids must be a non-empty array');
  }

  const parsed = ids.map(Number);
  if (parsed.some(n => !Number.isFinite(n))) {
    throw makeErr(400, 'VALIDATION_ERROR', 'ids must be numbers');
  }

  const set = new Set(parsed);

  return withWriteLock(env, async () => {
    const cars = await readCarsNoLock(env);
    const before = cars.length;

    const remaining = cars.filter(c => !set.has(Number(c?.id)));
    const deleted = before - remaining.length;

    await writeCarsAtomically(env, remaining);
    return { deleted };
  });
}
