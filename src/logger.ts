// Tiny structured logger. Avoids a dependency; emits single-line JSON-ish records.

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentThreshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return ORDER[lvl] ?? ORDER.info;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < currentThreshold()) return;
  const record = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  child: (base: Record<string, unknown>) => ({
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, { ...base, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, { ...base, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, { ...base, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, { ...base, ...meta }),
  }),
};

export type Logger = typeof logger;
