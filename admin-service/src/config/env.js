export function loadEnv() {
  const required = [
    'PORT',
    'DATA_ROOT'
  ];

  const missing = required.filter(k => !process.env[k]);

  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }

  return {
    PORT: Number(process.env.PORT),
    DATA_ROOT: process.env.DATA_ROOT
  };
}
