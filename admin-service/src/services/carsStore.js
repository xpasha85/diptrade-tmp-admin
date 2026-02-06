import fs from 'fs/promises';
import path from 'path';

function carsJsonPath(dataRoot) {
  return path.resolve(dataRoot, 'cars.json');
}

export async function readCars(env) {
  const filePath = carsJsonPath(env.DATA_ROOT);

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error(`cars.json not found at: ${filePath}`);
      e.status = 500;
      e.code = 'CARS_JSON_NOT_FOUND';
      throw e;
    }
    const e = new Error(`Failed to read cars.json: ${err?.message || String(err)}`);
    e.status = 500;
    e.code = 'CARS_JSON_READ_FAILED';
    throw e;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    const e = new Error(`cars.json is not valid JSON: ${err?.message || String(err)}`);
    e.status = 500;
    e.code = 'CARS_JSON_INVALID';
    throw e;
  }

  if (!Array.isArray(data)) {
    const e = new Error('cars.json must be an array of cars');
    e.status = 500;
    e.code = 'CARS_JSON_WRONG_SHAPE';
    throw e;
  }

  return data;
}

export async function readCarById(env, id) {
  const cars = await readCars(env);
  const numericId = Number(id);

  if (!Number.isFinite(numericId)) {
    const e = new Error('Invalid id');
    e.status = 400;
    e.code = 'INVALID_ID';
    throw e;
  }

  const car = cars.find(c => Number(c?.id) === numericId);
  return car || null;
}
