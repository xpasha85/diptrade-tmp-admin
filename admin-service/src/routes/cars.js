import { Router } from 'express';
import {
  readCars,
  readCarById,
  createCar,
  updateCar,
  deleteCar,
  bulkDeleteCars
} from '../services/carsStore.js';
import { loadEnv } from '../config/env.js';

const router = Router();
const env = loadEnv();

function handleErr(res, e) {
  res.status(e.status || 500).json({
    error: e.code || 'UNKNOWN_ERROR',
    message: e.message || 'Unknown error'
  });
}

router.get('/', async (req, res) => {
  try {
    const cars = await readCars(env);
    res.json({ cars });
  } catch (e) {
    handleErr(res, e);
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
    handleErr(res, e);
  }
});

// Этап D: create (без фото)
router.post('/', async (req, res) => {
  try {
    const car = await createCar(env, req.body || {});
    res.status(201).json({ car });
  } catch (e) {
    handleErr(res, e);
  }
});

// Этап D: update (patch)
router.patch('/:id', async (req, res) => {
  try {
    const car = await updateCar(env, req.params.id, req.body || {});
    res.json({ car });
  } catch (e) {
    handleErr(res, e);
  }
});

// Этап D: delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteCar(env, req.params.id);
    res.json(result);
  } catch (e) {
    handleErr(res, e);
  }
});

// Этап D: bulk delete (1 транзакция)
router.post('/bulk-delete', async (req, res) => {
  try {
    const ids = req.body?.ids;
    const result = await bulkDeleteCars(env, ids);
    res.json(result);
  } catch (e) {
    handleErr(res, e);
  }
});

export default router;
