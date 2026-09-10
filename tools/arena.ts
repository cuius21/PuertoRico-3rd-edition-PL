import { mkdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { MctsBot } from '../src/bots/MctsBot';
import { GreedyBot } from '../src/bots/GreedyBot';
import { runGame, summarizeArena, type GameRecord } from './arena-core';
import { ARENA_HELP, parseArenaArgs } from './arena-cli';
import { NeuralValueNetwork } from '../src/bots/neural/network';

function main(): void {
  const { options, output, quiet, help, model, modelWeight } = parseArenaArgs(process.argv.slice(2));
  if (help) { console.log(ARENA_HELP); return; }
  const modelText = model ? readFileSync(resolve(model), 'utf8') : undefined;
  const network = modelText ? NeuralValueNetwork.fromJSON(JSON.parse(modelText)) : undefined;
  const records: GameRecord[] = [];
  for (let index = 0; index < options.games; index++) {
    const record = runGame(options, index, (policy, random, _seat, candidate) => {
      if (policy === 'greedy') return new GreedyBot();
      if (policy === 'mcts') return new MctsBot(options.budgetMs);
      return new HardcoreBot({
        timeBudgetMs: options.iterations === undefined ? options.budgetMs : Infinity,
        maxIterations: options.iterations ?? 1_000_000_000,
        random,
        ...(candidate && network ? { evaluator: network, evaluatorWeight: modelWeight } : {}),
      });
    });
    records.push(record);
    if (!quiet) {
      console.error('Game ' + (index + 1) + '/' + options.games + ' seat=' + (record.candidateSeat + 1) +
        ' seed=' + record.environmentSeed + ' ' + record.status + ' moves=' + record.moves +
        ' credit=' + record.candidateWinCredit + ' margin=' + record.candidateScoreMargin +
        ' ms=' + Math.round(record.elapsedMs) +
        (record.status === 'completed' ? '' : ' reason=' + record.reason));
    }
  }
  const report = { ...summarizeArena(options, records),
    neuralCandidate: modelText ? { path: resolve(model!), sha256: createHash('sha256').update(modelText).digest('hex'), weight: modelWeight } : null,
  };
  if (output) {
    const path = resolve(output);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = path + '.tmp';
    writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n');
    renameSync(temporary, path);
    const { games: _, ...summary } = report;
    console.log(JSON.stringify({ ...summary, output: path }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (report.overall.invalid || report.overall.incomplete) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
