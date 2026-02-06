import express from 'express';
import healthRouter from './routes/health.js';
import carsRouter from './routes/cars.js';


export function createApp() {
  const app = express();

  app.use(express.json());

  // --- CORS для локальной разработки (read-only) ---
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use('/health', healthRouter);
  app.use('/cars', carsRouter);


  return app;
}
