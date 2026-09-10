import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseMayorLabArgs, mayorJobs, mayorBudgetDescription, summarizeMayorObservations, mayorRuntimeHashes,
 type MayorObservation, type MayorGameRecord, type SeatObservations } from '../../tools/mayor-lab';

function decision(phase: string, mayor: MayorObservation | null = null): SeatObservations['decisions'][number] {
 return { phase, actualMs: 3, searchIterations: phase === 'mayor' ? 0 : 8, searchElapsedMs: 2, evaluatorErrors: 0,
  neuralPolicyCalls: 0, neuralPredictions: 0, cachePolicyCalls: 0, illegal: false, threw: false, mayor };
}
function game(rows: SeatObservations['decisions'], candidateSeat = 0): MayorGameRecord {
 return { gameIndex: 0, environmentSeed: 7, candidateSeat, policies: ['hardcore','hardcore','hardcore'],
  actualPolicies: ['mayorHardcore','HardcoreBot','HardcoreBot'], status:'completed',moves:5,rounds:1,elapsedMs:20,
  decisionMs:[10,5,5],decisionCounts:[3,1,1],traceHash:'aaaaaaaa',reason:'fixture',scores:[],winCredits:[1,0,0],
  candidateWinCredit:1,candidateScoreMargin:1,observations:[{decisions:rows},{decisions:[decision('builder')]},{decisions:[]}] };
}
const plan: MayorObservation = {planCount:6,batches:2,rollouts:12,elapsedMs:70,cacheHit:false,selectedBaseline:false,errors:0,generationMs:2};
const cached: MayorObservation = {planCount:0,batches:0,rollouts:0,elapsedMs:.1,cacheHit:true,selectedBaseline:false,errors:0};
describe('isolated Mayor arena configuration and scheduling',()=>{
 it('defaults to an explicit base-three two-arm screening with capped whole-plan budget',()=>{
  const config=parseMayorLabArgs([]);
  expect(config.variants).toEqual(['control','mayorHardcore']);
  expect(config.options.players).toBe(3);
  expect(Object.values(config.options.expansions)).toEqual([false,false,false,false]);
  expect(config.mayor.timeBudgetMs).toBe(50);
  expect(config.options.iterations).toBeUndefined();
  expect(mayorBudgetDescription(config).exactProductionNonMayorSettings).toBe(false);
 });
 it('labels fixed delegate iterations separately while keeping the Mayor real-time cap',()=>{
  const config=parseMayorLabArgs(['--games','18','--iterations','8','--budget-ms','650','--mayor-budget-ms','80','--mayor-batches','1']);
  expect(mayorBudgetDescription(config).nonMayor).toMatchObject({timeBudgetMs:null,timeBudgetMode:'unlimited-clock-fixed-iterations',maxIterations:8});
  expect(config.mayor).toMatchObject({timeBudgetMs:80,maxBatches:1});
  expect(mayorBudgetDescription(parseMayorLabArgs(['--budget-ms','650'])).exactProductionNonMayorSettings).toBe(true);
 });
 it.each([
  ['--games','9'],['--games','7'],['--mayor-budget-ms','651'],['--budget-ms','651'],
  ['--mayor-batches','0'],['--mayor-candidates','13'],['--iterations','0'],
  ['--variants','control'],['--variants','neural'],['--variants','mayorHardcore,neural','--model','x'],
  ['--model','unused'],['--unknown','1'],['--seed','1','--seed','2'],['--workers'],
 ].map(args=>({args})))('rejects invalid or misleading CLI $args',({args})=>expect(()=>parseMayorLabArgs(args)).toThrow());
 it('balances complete seat rotations and both positions in the two-arm job order',()=>{
  const config=parseMayorLabArgs(['--games','18']),jobs=mayorJobs(config);
  expect(jobs).toHaveLength(36);
  expect(jobs.slice(0,4)).toEqual([{index:0,variant:'control'},{index:0,variant:'mayorHardcore'},{index:1,variant:'mayorHardcore'},{index:1,variant:'control'}]);
  for(const variant of config.variants){
   expect(jobs.filter(job=>job.variant===variant).map(job=>job.index)).toEqual(Array.from({length:18},(_,i)=>i));
   expect([0,1,2].map(seat=>jobs.filter(job=>job.variant===variant&&job.index%3===seat).length)).toEqual([6,6,6]);
   expect([0,1].map(position=>jobs.filter((job,index)=>job.variant===variant&&index%2===position).length)).toEqual([9,9]);
  }
 });
 it('permits a separate mayorNeural/neural reference trial with balanced cyclic positions',()=>{
  const config=parseMayorLabArgs(['--variants','mayorNeural,neural','--model','model.json','--games','18']);
  const jobs=mayorJobs(config);
  expect(config.variants).toEqual(['control','mayorNeural','neural']);
  for(const variant of config.variants)expect([0,1,2].map(position=>jobs.filter((job,index)=>job.variant===variant&&index%3===position).length)).toEqual([6,6,6]);
 });
});
describe('Mayor observations',()=>{
 it('counts a plan once, cache hits separately and never re-adds cached batch/rollout work',()=>{
  const result=summarizeMayorObservations([game([decision('mayor',plan),decision('mayor',cached),decision('mayor',cached),decision('builder')])],true);
  expect(result).toMatchObject({planningDecisions:1,cacheHits:2,planCount:6,batches:2,rollouts:12,
   baselineSelections:0,alternativeSelections:1,planningMs:70,cacheHitMs:.2,candidateGenerationMs:2,
   searchIterations:8,contractViolations:0,mayorDecisions:3,decisions:4});
  expect(result.actualMs).toBe(12);
  expect(result.mayorActualMs).toBe(9);
 });
 it('separates candidate and opponent timings after a seat rotation',()=>{
  const sample=game([decision('mayor',plan)],1);
  expect(summarizeMayorObservations([sample],true).planningDecisions).toBe(0);
  expect(summarizeMayorObservations([sample],false).planningDecisions).toBe(1);
 });
 it('reports repeated cache search work, stale Mayor stats, errors and illegal actions',()=>{
  const a=decision('mayor',{...cached,batches:1}),b=decision('builder',plan),c=decision('trader');
  c.illegal=true;c.threw=true;c.evaluatorErrors=2;c.neuralPolicyCalls=5;c.neuralPredictions=4;
  const result=summarizeMayorObservations([game([a,b,c,decision('mayor',{...plan,errors:3})])],true);
  expect(result).toMatchObject({contractViolations:2,illegalActions:1,thrownDecisions:1,evaluatorErrors:2,plannerErrors:3,
   neuralPolicyCalls:5,neuralPredictions:4});
 });
 it('keeps baseline selections and cold staffing overhead visible without pretending they are search iterations',()=>{
  const result=summarizeMayorObservations([game([decision('mayor',{...plan,selectedBaseline:true}),decision('mayor')])],true);
  expect(result).toMatchObject({baselineSelections:1,alternativeSelections:0,searchIterations:0,mayorDecisions:2,planningDecisions:1});
 });
});
describe('local runtime and helper fingerprint',()=>{
 it('follows static and dynamic relative imports, handles cycles, and detects helper edits',()=>{
  const folder=mkdtempSync(resolve(tmpdir(),'puerto-mayor-fingerprint-'));
  try{
   mkdirSync(resolve(folder,'tools'));mkdirSync(resolve(folder,'src'));
   writeFileSync(resolve(folder,'tools/main.ts'),"import {a} from '../src/a'; export async function worker(){await import('./worker.mjs');}");
   writeFileSync(resolve(folder,'src/a.ts'),"export {b} from './b';");
   writeFileSync(resolve(folder,'src/b.ts'),"import type {a} from './a';");
   writeFileSync(resolve(folder,'tools/worker.mjs'),"import './main.ts';");
   const before=mayorRuntimeHashes(folder,['tools/main.ts']);
   expect(Object.keys(before).sort()).toEqual(['src/a.ts','src/b.ts','tools/main.ts','tools/worker.mjs']);
   writeFileSync(resolve(folder,'src/b.ts'),'export const b=2;');
   expect(mayorRuntimeHashes(folder,['tools/main.ts'])['src/b.ts']).not.toBe(before['src/b.ts']);
  }finally{rmSync(folder,{recursive:true,force:true});}
 });
 it('rejects a missing local helper instead of silently leaving it unfingerprinted',()=>{
  const folder=mkdtempSync(resolve(tmpdir(),'puerto-mayor-missing-'));
  try{writeFileSync(resolve(folder,'main.ts'),"import './missing';");
   expect(()=>mayorRuntimeHashes(folder,['main.ts'])).toThrow('Cannot fingerprint');
  }finally{rmSync(folder,{recursive:true,force:true});}
 });
});
