import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parsePolicyDataset } from './train-policy';
import type { PolicyDataset, PolicyTeacherMetadata, TeacherConfig, TeacherGame, TeacherPolicy } from './collect-policy';

export interface PolicyMergeSource { path: string; sha256: string; dataset: unknown }
export interface PolicySourceReference { path: string; sha256: string; originalGameIndex: number }
interface MergedTeacherGame extends TeacherGame { mergeSources: PolicySourceReference[] }
interface SourceSummary {
  path: string; sha256: string; games: number; samples: number; normalizedHardcoreGames: number;
  config: TeacherConfig; metadata: unknown;
}
export interface MergedPolicyDataset extends PolicyDataset {
  games: MergedTeacherGame[];
  metadata: PolicyTeacherMetadata & {
    operation: 'concatenate-complete-policy-datasets';
    sourceDatasets: SourceSummary[];
    modelHashes: string[];
    configCompatibility: string;
  };
}
function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}
function teacherProvenance(dataset: PolicyDataset, game: TeacherGame): {
  teacherPolicies: TeacherPolicy[]; teacherModelHash?: string; normalized: boolean;
} {
  const mode = dataset.config.teacher ?? dataset.metadata?.teacher ?? 'hardcore';
  if (!['hardcore', 'neural', 'mixed'].includes(mode)) throw new Error('Unsupported source teacher mode');
  if (dataset.config.teacher && dataset.metadata?.teacher && dataset.config.teacher !== dataset.metadata.teacher) {
    throw new Error('Contradictory source teacher mode');
  }
  let policies = game.teacherPolicies;
  const normalized = policies === undefined;
  if (normalized) {
    if (mode !== 'hardcore' || !Array.isArray(game.record.policies) || game.record.policies.length !== 3 ||
      game.record.policies.some(policy => policy !== 'hardcore') || game.teacherModelHash ||
      dataset.config.modelHash || dataset.metadata?.modelHash) {
      throw new Error('Missing teacherPolicies cannot be inferred as legacy Hardcore');
    }
    policies = ['hardcore', 'hardcore', 'hardcore'];
  }
  if (!Array.isArray(policies) || policies.length !== 3 ||
    policies.some(policy => policy !== 'hardcore' && policy !== 'neuralSelectiveRollout')) throw new Error('Invalid per-game teacherPolicies');
  const neural = policies.includes('neuralSelectiveRollout');
  if ((mode === 'hardcore' && neural) || (mode === 'neural' && policies.some(policy => policy === 'hardcore'))) {
    throw new Error('Per-game teachers contradict source mode');
  }
  if (game.teacherModelHash !== undefined && !validHash(game.teacherModelHash)) throw new Error('Invalid per-game model hash');
  if (!neural) return { teacherPolicies: [...policies], normalized,
    ...(game.teacherModelHash ? { teacherModelHash: game.teacherModelHash } : {}) };
  const hashes = [game.teacherModelHash, dataset.config.modelHash, dataset.metadata?.modelHash]
    .filter((value): value is string => value !== undefined && value !== null);
  if (!hashes.length || hashes.some(hash => !validHash(hash)) || new Set(hashes).size !== 1) {
    throw new Error('Missing, invalid or contradictory neural teacher model hash');
  }
  return { teacherPolicies: [...policies], teacherModelHash: hashes[0]!, normalized };
}

export function mergePolicyDatasets(sources: readonly PolicyMergeSource[]): MergedPolicyDataset {
  if (sources.length < 2) throw new Error('Merge requires at least two source datasets');
  const seenSeeds = new Set<number>(), seenPaths = new Set<string>();
  const games: MergedTeacherGame[] = [], summaries: SourceSummary[] = [];
  const modelHashes = new Set<string>();
  let first: PolicyDataset | undefined, iterations: number | undefined;
  for (const source of sources) {
    if (!validHash(source.sha256)) throw new Error('Invalid source SHA256');
    const path = resolve(source.path);
    const pathKey = process.platform === 'win32' ? path.toLowerCase() : path;
    if (seenPaths.has(pathKey)) throw new Error('Duplicate source path');
    seenPaths.add(pathKey);
    const dataset = parsePolicyDataset(source.dataset);
    if (dataset.games.length !== dataset.config.games) throw new Error('Incomplete source dataset: ' + path);
    if (!first) { first = dataset; iterations = dataset.config.iterations; }
    if (dataset.config.iterations !== iterations) throw new Error('Source teacher iterations differ');
    let normalizedHardcoreGames = 0;
    for (const [originalGameIndex, game] of dataset.games.entries()) {
      if (seenSeeds.has(game.seed)) throw new Error('Duplicate environment seed across sources: ' + game.seed);
      seenSeeds.add(game.seed);
      if (game.samples.some(sample => sample.teacherIterations !== iterations)) {
        throw new Error('Sample teacherIterations differ from source configuration: ' + game.seed);
      }
      const provenance = teacherProvenance(dataset, game);
      normalizedHardcoreGames += Number(provenance.normalized);
      if (provenance.teacherPolicies.includes('neuralSelectiveRollout')) modelHashes.add(provenance.teacherModelHash!);
      const previous = (game as Partial<MergedTeacherGame>).mergeSources ?? [];
      if (!Array.isArray(previous) || previous.some(item => !item || typeof item.path !== 'string' ||
        !validHash(item.sha256) || !Number.isSafeInteger(item.originalGameIndex) || item.originalGameIndex < 0)) {
        throw new Error('Invalid existing per-game merge provenance');
      }
      // Preserve sample arrays, records and any existing provenance verbatim. No dedupe or ordering change.
      games.push({ ...game, teacherPolicies: provenance.teacherPolicies,
        ...(provenance.teacherModelHash ? { teacherModelHash: provenance.teacherModelHash } : {}),
        mergeSources: [...previous.map(item => ({ ...item })), { path, sha256: source.sha256, originalGameIndex }] });
    }
    summaries.push({ path, sha256: source.sha256, games: dataset.games.length,
      samples: dataset.games.reduce((sum, game) => sum + game.samples.length, 0), normalizedHardcoreGames,
      config: structuredClone(dataset.config), metadata: structuredClone(dataset.metadata ?? null) });
  }
  const policies = new Set(games.flatMap(game => game.teacherPolicies!));
  const teacher = policies.size > 1 ? 'mixed' : policies.has('neuralSelectiveRollout') ? 'neural' : 'hardcore';
  const onlyModel = modelHashes.size === 1 ? [...modelHashes][0]! : undefined;
  // Config seed/exploration are retained for parser compatibility, not a claim of a new generator run.
  const { modelHash: _oldHash, ...compatibilityConfig } = first!.config;
  const merged: MergedPolicyDataset = {
    format: first!.format, version: first!.version, featureSchema: first!.featureSchema,
    featureNames: [...first!.featureNames], actionVocabulary: [...first!.actionVocabulary],
    config: { ...compatibilityConfig, games: games.length, iterations: iterations!, teacher,
      ...(onlyModel ? { modelHash: onlyModel } : {}) },
    metadata: {
      teacher, modelHash: onlyModel ?? null, modelPath: null, neuralTeacher: null, mixedSchedule: null,
      recordPolicyLabels: 'GameRecord.policies retains legacy arena seed labels; TeacherGame.teacherPolicies records actual bots',
      operation: 'concatenate-complete-policy-datasets', sourceDatasets: summaries, modelHashes: [...modelHashes],
      configCompatibility: 'Merged config seed and exploration come from the first source for legacy parser compatibility; actual collection configurations, teacher settings and model hashes are recorded in sourceDatasets and each game.',
    },
    games,
  };
  parsePolicyDataset(merged);
  return merged;
}

export function loadPolicyMergeSource(path: string): PolicyMergeSource {
  const absolute = realpathSync(resolve(path)), bytes = readFileSync(absolute);
  return { path: absolute, sha256: createHash('sha256').update(bytes).digest('hex'),
    dataset: JSON.parse(bytes.toString('utf8')) as unknown };
}

export function mergePolicyMain(argv = process.argv.slice(2)): void {
  const inputs: string[] = [];
  let output: string | undefined;
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing merge argument value');
    if (key === '--input') inputs.push(value);
    else if (key === '--output' && output === undefined) output = resolve(value);
    else throw new Error('Invalid merge argument: ' + key);
  }
  if (!output) throw new Error('Merge requires --output');
  const sources = inputs.map(loadPolicyMergeSource);
  const merged = mergePolicyDatasets(sources);
  // Exclusive creation also protects input aliases/hard links and previous outputs from accidental overwrite.
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(merged), { flag: 'wx' });
  console.log(JSON.stringify({ output, sources: sources.length, games: merged.games.length,
    samples: merged.games.reduce((sum, game) => sum + game.samples.length, 0), teacher: merged.config.teacher,
    iterations: merged.config.iterations, modelHashes: merged.metadata.modelHashes }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) mergePolicyMain();
