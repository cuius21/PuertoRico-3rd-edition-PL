import './register-typescript.mjs';
const { runPolicyCacheWorker } = await import('./policy-cache-lab.ts');
runPolicyCacheWorker();
