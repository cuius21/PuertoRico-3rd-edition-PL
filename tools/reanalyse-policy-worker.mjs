import './register-typescript.mjs';
const { runReanalysisWorker } = await import('./reanalyse-policy.ts');
runReanalysisWorker();
