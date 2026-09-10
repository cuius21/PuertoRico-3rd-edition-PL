import { Worker } from 'node:worker_threads';

export async function runWorkerPool<TJob, TResult>(
  entry: URL, config: unknown, jobs: TJob[], concurrency: number,
  receive: (job: TJob, result: TResult) => void,
): Promise<void> {
  if (!jobs.length) return;
  const workers: Worker[] = [];
  let next = 0;
  let complete = 0;
  let stopping = false;
  try {
    await new Promise<void>((resolve, reject) => {
      for (let i = 0; i < Math.min(concurrency, jobs.length); i++) {
        const worker = new Worker(entry, { workerData: config });
        workers.push(worker);
        worker.on('error', reject);
        worker.on('exit', code => { if (!stopping && complete < jobs.length) reject(new Error('Unexpected worker exit ' + code)); });
        worker.on('message', message => {
          try {
            if (message.error) throw new Error(message.error);
            if (!message.ready) { receive(message.job, message.result); complete++; }
            if (complete === jobs.length) resolve();
            else if (next < jobs.length) worker.postMessage(jobs[next++]!);
          } catch (error) { reject(error); }
        });
      }
    });
  } finally {
    stopping = true;
    await Promise.all(workers.map(worker => worker.terminate()));
  }
}
