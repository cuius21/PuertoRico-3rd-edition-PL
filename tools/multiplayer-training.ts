import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { HardcoreBot } from '../src/bots/HardcoreBot';
import { ChampionBot } from '../src/bots/ChampionBot';
import { hardcoreActionKey } from '../src/bots/hardcorePolicy';
import { evaluateHardcoreState } from '../src/bots/hardcoreEvaluation';
import { serializeGameState, deserializeGameState } from '../src/game/GameSerializer';
import { encodeNeuralState } from '../src/bots/neural/multiplayer/features';
import { encodePolicyInput, type PolicyExample } from '../src/bots/neural/multiplayer/policyFeatures';
import { NeuralPolicyNetwork, type PolicyTrainingExample } from '../src/bots/neural/multiplayer/policyNetwork';
import { NeuralValueNetwork, type NeuralExample } from '../src/bots/neural/multiplayer/valueNetwork';
import { MultiplayerNeuralBot } from '../src/bots/neural/multiplayer/MultiplayerNeuralBot';
import { transferLegacyPolicy } from '../src/bots/neural/multiplayer/transfer';
import { getReleasedNeuralModel } from '../src/bots/neural/releaseModel';
import { splitPolicyGames, sharpenPolicyTarget } from './train-policy';
import { runGame, seededRandom, deriveSeed, type ArenaOptions, type GameRecord } from './arena-core';

export const ACTIVE_PHASES = ['roleSelection','builder','trader','settler'];
export interface TrainingConfig { seed:number; gamesPerCount:number; trajectoryIterations:number; teacherIterations:number; samplesPerPhase:number; directory:string }
export interface SampleState { move:number; phase:string; snapshot:ReturnType<typeof serializeGameState> }
export interface Trajectory { players:3|4|5; index:number; seed:number; record:GameRecord; snapshots:SampleState[]; values:NeuralExample[] }
export interface Labelled { players:3|4|5; index:number; seed:number; samples:PolicyExample[]; values:NeuralExample[]; sourceHash:string; labelIterations:number }
export type EvalVariant='control'|'transfer'|'visits'|'q'|'visitsValue';
export interface EvalConfig { seed:number; rotations:number; budgetMs:number; iterations:number; directory:string; models:string }
export type TrainingWorkerConfig={kind:'generate';config:TrainingConfig}|{kind:'label';config:TrainingConfig}|{kind:'evaluate';config:EvalConfig};
export type TrainingJob={players:3|4|5;index:number;variant?:EvalVariant};
export const digest=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
export const readJSON=<T=any>(path:string):T=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export const saveJSON=(path:string,data:unknown)=>writeFileSync(path,JSON.stringify(data));
export const gamePath=(directory:string,kind:string,n:number,index:number)=>join(directory,kind,n+'p-'+index+'.json');
const unique=(actions:ReturnType<Parameters<typeof encodePolicyInput>[0]['getValidActions']>)=>[...new Map(actions.map(a=>[hardcoreActionKey(a),a])).values()];

export function generateTrajectory(config:TrainingConfig,job:TrainingJob):Trajectory{
  const options:ArenaOptions={games:config.gamesPerCount,players:job.players,seed:deriveSeed(config.seed,job.players),
    budgetMs:650,iterations:config.trajectoryIterations,maxMoves:5000,candidate:'hardcore',opponents:'hardcore',expansions:{festival:false,corsair:false,newBuildings:false,nobleBuildings:false}};
  const byPhase=new Map(ACTIVE_PHASES.map(p=>[p,[] as SampleState[]]));
  const counts=new Map(ACTIVE_PHASES.map(p=>[p,0]));
  const rng=seededRandom(deriveSeed(options.seed,3000000+job.index));
  const values:NeuralExample[]=[];let valueCount=0;
  const record=runGame(options,job.index*job.players,(_p,random)=>new HardcoreBot({random,timeBudgetMs:Infinity,maxIterations:config.trajectoryIterations}),{
    onDecision({state,move}){
      const phase=state.getCurrentPhase().type;
      if(phase==='roleSelection'){
        const slot=valueCount<24?valueCount:Math.floor(rng()*(valueCount+1));valueCount++;
        if(slot<24)values[slot]={inputs:encodeNeuralState(state),baseline:evaluateHardcoreState(state),target:[]};
      }
      if(!byPhase.has(phase)||unique(state.getValidActions(state.getCurrentPlayer().id)).length<2)return;
      const count=counts.get(phase)!;counts.set(phase,count+1);
      const slot=count<config.samplesPerPhase?count:Math.floor(rng()*(count+1));
      if(slot<config.samplesPerPhase)byPhase.get(phase)![slot]={move,phase,snapshot:serializeGameState(state)};
    },
  });
  if(record.status!=='completed')throw new Error('Invalid trajectory '+JSON.stringify(record));
  for(const sample of values)sample.target=[...record.winCredits];
  return {players:job.players,index:job.index,seed:record.environmentSeed,record,snapshots:[...byPhase.values()].flat().sort((a,b)=>a.move-b.move),values};
}
export function labelTrajectory(config:TrainingConfig,job:TrainingJob):Labelled{
  const path=gamePath(config.directory,'trajectories',job.players,job.index),raw=readFileSync(path);
  const source=JSON.parse(raw.toString('utf8')) as Trajectory;
  if(source.players!==job.players||source.index!==job.index||source.record.status!=='completed')throw new Error('Trajectory metadata mismatch');
  const samples:PolicyExample[]=[];
  for(const item of source.snapshots){
    const state=deserializeGameState(item.snapshot),pid=state.getCurrentPlayer().id;
    const before=JSON.stringify(serializeGameState(state));
    const bot=new ChampionBot({timeBudgetMs:Infinity,maxIterations:config.teacherIterations,
      random:seededRandom(deriveSeed(source.seed,4000000+item.move)),rolloutExploration:0.08,evaluatorWeight:0});
    const actions=unique(state.getValidActions(pid)),input=encodePolicyInput(state,pid,actions);
    if(!input)throw new Error('Unencodable teacher state');
    bot.chooseAction(state,pid);
    if(JSON.stringify(serializeGameState(state))!==before||bot.lastSearchStats.evaluatorErrors)throw new Error('Teacher mutated snapshot or failed');
    const roots=new Map(bot.lastSearchStats.rootActions.map(r=>[r.key,r]));
    const rows=actions.map(a=>roots.get(hardcoreActionKey(a))!);
    const visits=rows.reduce((s,r)=>s+r.visits,0);
    if(visits!==config.teacherIterations||rows.some(r=>!r.visits))throw new Error('Incomplete teacher root coverage');
    samples.push({...input,target:rows.map(r=>r.visits/visits),teacherValues:rows.map(r=>r.value),
      teacherIterations:visits,phase:item.phase,mover:state.currentPlayerIndex});
  }
  return {players:source.players,index:source.index,seed:source.seed,samples,values:source.values,sourceHash:digest(raw),labelIterations:config.teacherIterations};
}
export function evaluationOptions(config:EvalConfig,n:3|4|5):ArenaOptions{
  return {players:n,games:n*config.rotations,seed:deriveSeed(config.seed,n),budgetMs:config.budgetMs,
    ...(config.iterations?{iterations:config.iterations}:{}),maxMoves:5000,candidate:'hardcore',opponents:'hardcore',expansions:{festival:false,corsair:false,newBuildings:false,nobleBuildings:false}};
}
export function runTrainingWorker(){
  const setup=workerData as TrainingWorkerConfig;
  const models=setup.kind==='evaluate'?{
    transfer:transferLegacyPolicy(getReleasedNeuralModel()),
    visits:NeuralPolicyNetwork.fromJSON(readJSON(join(setup.config.models,'visits.json'))),
    q:NeuralPolicyNetwork.fromJSON(readJSON(join(setup.config.models,'q.json'))),
    value:NeuralValueNetwork.fromJSON(readJSON(join(setup.config.models,'value.json'))),
  }:null;
  parentPort!.on('message',(job:TrainingJob)=>{
    try{
      let result:unknown;
      if(setup.kind==='generate')result=generateTrajectory(setup.config,job);
      else if(setup.kind==='label')result=labelTrajectory(setup.config,job);
      else{
        const config=setup.config,opts=evaluationOptions(config,job.players);
        let policyCalls=0,valueCalls=0,iterations=0,searches=0;
        const record=runGame(opts,job.index,(_p,random,_seat,candidate)=>{
          const search={random,timeBudgetMs:config.iterations?Infinity:config.budgetMs,maxIterations:config.iterations||1500};
          const bot=!candidate||job.variant==='control'?new HardcoreBot(search):new MultiplayerNeuralBot(
            job.variant==='transfer'?models!.transfer:job.variant==='q'?models!.q:models!.visits,
            {...search,...(job.variant==='visitsValue'?{value:models!.value,valueWeight:0.25}:{})});
          return {name:candidate?job.variant!:'Hardcore',chooseAction(state,pid){
            const policyBefore=bot instanceof MultiplayerNeuralBot?bot.policyCalls:0,valueBefore=bot instanceof MultiplayerNeuralBot?bot.valueCalls:0;
            const action=bot.chooseAction(state,pid);
            if(bot.lastSearchStats.evaluatorErrors)throw new Error('Candidate evaluation failed');
            if(candidate){
              policyCalls+=(bot instanceof MultiplayerNeuralBot?bot.policyCalls:0)-policyBefore;
              valueCalls+=(bot instanceof MultiplayerNeuralBot?bot.valueCalls:0)-valueBefore;
              iterations+=bot.lastSearchStats.iterations;searches+=Number(bot.lastSearchStats.iterations>0);
            }
            return action;
          }};
        });
        if(record.status!=='completed'||(job.variant!=='control'&&!policyCalls))throw new Error('Invalid evaluation '+JSON.stringify(record));
        result={record,policyCalls,valueCalls,iterations,searches,variant:job.variant,players:job.players};
      }
      parentPort!.postMessage({job,result});
    }catch(error){parentPort!.postMessage({job,error:error instanceof Error?error.stack:String(error)});}
  });
  parentPort!.postMessage({ready:true});
}

function policyMetric(model:NeuralPolicyNetwork|undefined,samples:readonly PolicyTrainingExample[]){
  let loss=0,correct=0;
  for(const sample of samples){
    const p=model?model.predict(sample):sample.baseline;
    const aggregate=new Map<number,{p:number;t:number}>();
    sample.actionIds.forEach((id,i)=>{const row=aggregate.get(id)??{p:0,t:0};row.p+=p[i]!;row.t+=sample.target[i]!;aggregate.set(id,row);});
    const rows=[...aggregate.values()],picked=rows.reduce((a,b)=>a.p>b.p?a:b),best=Math.max(...rows.map(r=>r.t));
    correct+=Number(picked.t>=best-1e-12);
    for(let i=0;i<p.length;i++)loss-=sample.target[i]!*Math.log(Math.max(1e-12,p[i]!));
  }
  return {samples:samples.length,loss:loss/samples.length,semanticTop1:correct/samples.length};
}
export function qTarget(values:readonly number[],players:number):number[]{
  const best=Math.max(...values),weights=values.map(q=>Math.exp(Math.max(-30,players*(q-best)/0.15))),sum=weights.reduce((s,w)=>s+w,0);
  return weights.map(w=>w/sum);
}
export function trainMultiplayer(games:Labelled[],directory:string,seed:number,epochs=24){
  mkdirSync(directory,{recursive:true});
  const train:Labelled[]=[],validation:Labelled[]=[];
  for(const n of [3,4,5]){
    const rows=games.filter(g=>g.players===n),split=splitPolicyGames(rows,deriveSeed(seed,n));
    train.push(...split.training);validation.push(...split.validation);
  }
  const seeds={trainingGameSeeds:train.map(g=>g.seed),validationGameSeeds:validation.map(g=>g.seed)};
  if(new Set([...seeds.trainingGameSeeds,...seeds.validationGameSeeds]).size!==games.length)throw new Error('Training seed overlap');
  saveJSON(join(directory,'split.json'),seeds);
  const report:Record<string,unknown>={split:seeds,games:games.length,scope:'Base game 3-5. Experimental; arena required.',targets:{visits:'visits temperature 0.25',q:'softmax(players * Q / 0.15); independent ablation'},models:{}};
  for(const kind of ['visits','q'] as const){
    const convert=(game:Labelled):PolicyTrainingExample[]=>game.samples.map(s=>({...s,target:kind==='visits'?sharpenPolicyTarget(s.target,0.25):qTarget(s.teacherValues,game.players)}));
    const samples=train.flatMap(convert),valid=validation.flatMap(convert);
    const model=transferLegacyPolicy(getReleasedNeuralModel());
    const baseline=policyMetric(undefined,valid),initial=policyMetric(model,valid);
    const rng=seededRandom(deriveSeed(seed,kind==='visits'?77:78));
    let best=model.toJSON({},true),bestLoss=initial.loss,bestEpoch=0;
    const history:unknown[]=[];
    for(let epoch=1;epoch<=epochs;epoch++){
      for(let i=samples.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[samples[i],samples[j]]=[samples[j]!,samples[i]!];}
      for(let i=0;i<samples.length;i+=48)model.trainBatch(samples.slice(i,i+48),{learningRate:0.0003,l2:0.0001});
      const measured=policyMetric(model,valid);history.push({epoch,...measured});
      if(measured.loss<bestLoss-0.0001){bestLoss=measured.loss;bestEpoch=epoch;best=model.toJSON({},true);}
      console.log(JSON.stringify({stage:'train',kind,epoch,validation:measured,bestEpoch}));
      if(epoch-bestEpoch>=5)break;
    }
    const selected=NeuralPolicyNetwork.fromJSON(best),perCount=Object.fromEntries([3,4,5].map(n=>{
      const rows=validation.filter(g=>g.players===n).flatMap(convert);return[n,{baseline:policyMetric(undefined,rows),learned:policyMetric(selected,rows)}];
    }));
    const metadata={...seeds,kind,bestEpoch,baseline,initial,perCount,history,trainedForMultiplayer:bestEpoch>0,sourceGames:games.length,teacherIterations:games[0]!.labelIterations,scope:'experimental-only',transfer:'released 3-player policy; fresh optimizer',seed};
    saveJSON(join(directory,kind+'.json'),selected.toJSON(metadata));saveJSON(join(directory,kind+'.checkpoint.json'),selected.toJSON(metadata,true));
    (report.models as Record<string,unknown>)[kind]=metadata;
  }
  const samples=train.flatMap(g=>g.values),valid=validation.flatMap(g=>g.values);
  const model=new NeuralValueNetwork({hiddenSize:32,seed:deriveSeed(seed,79),valueMode:'residual'});
  const initial=model.loss(valid),rng=seededRandom(deriveSeed(seed,80));
  let best=model.toJSON({},true),bestLoss=initial,bestEpoch=0;const history:unknown[]=[];
  for(let epoch=1;epoch<=epochs;epoch++){
    for(let i=samples.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[samples[i],samples[j]]=[samples[j]!,samples[i]!];}
    for(let i=0;i<samples.length;i+=32)model.trainBatch(samples.slice(i,i+32),{learningRate:0.0003,l2:0.001});
    const loss=model.loss(valid);history.push({epoch,loss});
    if(loss<bestLoss-0.0001){bestLoss=loss;bestEpoch=epoch;best=model.toJSON({},true);}
    console.log(JSON.stringify({stage:'train',kind:'value',epoch,loss,bestEpoch}));if(epoch-bestEpoch>=5)break;
  }
  const selected=NeuralValueNetwork.fromJSON(best),metadata={...seeds,initial,bestLoss,bestEpoch,history,seed,kind:'residual-value',target:'actual final winner credits; completed base-game role boundaries',scope:'experimental-only'};
  saveJSON(join(directory,'value.json'),selected.toJSON(metadata));saveJSON(join(directory,'value.checkpoint.json'),selected.toJSON(metadata,true));
  (report.models as Record<string,unknown>).value=metadata;
  saveJSON(join(directory,'training-report.json'),report);return report;
}
