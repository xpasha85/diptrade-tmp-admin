import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Admin service listening on port ${env.PORT}`);
});
