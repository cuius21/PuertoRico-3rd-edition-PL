import './register-typescript.mjs';
const { runPolicyCollectorWorker } = await import('./collect-policy.ts');
runPolicyCollectorWorker();
