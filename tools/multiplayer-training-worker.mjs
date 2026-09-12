import './register-typescript.mjs';
const { runTrainingWorker } = await import('./multiplayer-training.ts');
runTrainingWorker();
