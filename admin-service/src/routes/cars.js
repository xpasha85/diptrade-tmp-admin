import { Router } from 'express';
import { readCars, readCarById } from '../services/carsStore.js';
import { loadEnv } from '../config/env.js';

const router = Router();

// env читаем один раз на модуль (у нас env vars статичные)
const env = loadEnv();

router.get('/', async (req, res) => {
  try {
    const cars = await readCars(env);
    res.json({ cars });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.code || 'UNKNOWN_ERROR',
      message: e.message || 'Unknown error'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const car = await readCarById(env, req.params.id);
    if (!car) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Car not found' });
    }
    res.json({ car });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.code || 'UNKNOWN_ERROR',
      message: e.message || 'Unknown error'
    });
  }
});

export default router;
