import './register-typescript.mjs';
const { runMayorWorker } = await import('./mayor-lab.ts');
await runMayorWorker();
