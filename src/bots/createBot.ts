import type { Bot } from './Bot';
import { RandomBot } from './RandomBot';
import { GreedyBot } from './GreedyBot';
import { MctsBot } from './MctsBot';
import { HardcoreBot } from './HardcoreBot';
import { NeuralBot } from './NeuralBot';
import { getReleasedNeuralModel } from './neural/releaseModel';

export const BOT_DIFFICULTIES = ['easy', 'hard', 'ai', 'hardcore', 'neural'] as const;
export type BotDifficulty = typeof BOT_DIFFICULTIES[number];

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return typeof value === 'string' && (BOT_DIFFICULTIES as readonly string[]).includes(value);
}

export function createBot(difficulty: BotDifficulty): Bot {
  switch (difficulty) {
    case 'neural': return new NeuralBot(getReleasedNeuralModel(), { timeBudgetMs: 650, cachePolicy: true });
    case 'hardcore': return new HardcoreBot();
    case 'ai': return new MctsBot();
    case 'hard': return new GreedyBot();
    default: return new RandomBot();
  }
}

export function botDifficulty(bot: Bot): BotDifficulty {
  switch (bot.name) {
    case 'NeuralBot': return 'neural';
    case 'HardcoreBot': return 'hardcore';
    case 'MctsBot': return 'ai';
    case 'GreedyBot': return 'hard';
    default: return 'easy';
  }
}
