// Process-wide guard so the scheduler and manual triggers never run ingestion
// concurrently within a single instance.

export class IngestionBusyError extends Error {
  constructor() {
    super('ingestion already running');
    this.name = 'IngestionBusyError';
  }
}

let inFlight = false;

export function isIngestionRunning(): boolean {
  return inFlight;
}

export async function withIngestionLock<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight) throw new IngestionBusyError();
  inFlight = true;
  try {
    return await fn();
  } finally {
    inFlight = false;
  }
}
