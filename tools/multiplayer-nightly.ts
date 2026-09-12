import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runWorkerPool } from './worker-pool';
import { deriveSeed, summarizeArena } from './arena-core';
import { pairedComparison } from './neural-lab';
import { getReleasedNeuralModel } from '../src/bots/neural/releaseModel';
import { trainMultiplayer, evaluationOptions, digest, readJSON, saveJSON, gamePath,
  type TrainingConfig, type EvalConfig, type TrainingJob, type Labelled, type Trajectory, type EvalVariant } from './multiplayer-training';

const entry=new URL('./multiplayer-training-worker.mjs',import.meta.url);
const variants:EvalVariant[]=['control','transfer','visits','q','visitsValue'];
export async function runNightly(argv=process.argv.slice(2)){
  const args=new Map<string,string>();
  for(let i=0;i<argv.length;i+=2){
    const k=argv[i]?.replace(/^--/,''),v=argv[i+1];
    if(!k||!['output','games-per-count','trajectory-iterations','teacher-iterations','samples-per-phase','workers','epochs','seed','pilot-rotations','pilot-budget','confirm-rotations','deadline'].includes(k)||!v||args.has(k))throw new Error('Invalid arguments');args.set(k,v);
  }
  const num=(key:string,fallback:number,min=1,max=20000)=>{const n=Number(args.get(key)??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error('Invalid '+key);return n;};
  const directory=resolve(args.get('output')??'work/neural-multiplayer-20260912/nightly-v1');
  mkdirSync(directory,{recursive:true});
  const config:TrainingConfig={seed:num('seed',912202602,0,0xffffffff),gamesPerCount:num('games-per-count',36,2),trajectoryIterations:num('trajectory-iterations',64),teacherIterations:num('teacher-iterations',512),samplesPerPhase:num('samples-per-phase',6),directory};
  const workers=num('workers',2,1,4),epochs=num('epochs',24),pilotRotations=num('pilot-rotations',4),pilotBudget=num('pilot-budget',100),confirmRotations=num('confirm-rotations',10);
  const deadline=args.get('deadline')??'2026-09-12T05:40:00Z';if(!Number.isFinite(Date.parse(deadline)))throw new Error('Invalid deadline');
  const planFile=join(directory,'plan.json'),statusFile=join(directory,'status.json');
  const sourcePaths=[...['core','actions','domain','state','src/bots'].flatMap(root=>readdirSync(root,{recursive:true}).map(x=>root+'/'+String(x).replaceAll('\\','/')).filter(x=>x.endsWith('.ts'))),
    'src/game/GameSerializer.ts','tools/multiplayer-training.ts','tools/multiplayer-nightly.ts','tools/multiplayer-training-worker.mjs','tools/arena-core.ts','tools/neural-lab.ts','tools/train-policy.ts','tools/worker-pool.ts'];
  const sources=Object.fromEntries(sourcePaths.map(p=>[p,digest(readFileSync(p))]));
  const plan={version:1,config,workers,epochs,pilotRotations,pilotBudget,confirmRotations,deadline,sources,
    stages:['completed-game trajectories','512-iteration reanalysis','visits vs Q policy training plus outcome value','equal-time pilot','frozen selected candidate at 650ms'],
    selection:'Pick the trained pilot variant with highest win credit, then mean margin; confirm only if above control. Do not tune on confirmation.',
    claim:'Experimental development. No automatic deployment. Confirmation is finite and no extra games are appended to chase significance.',
    budget:'Pilot and confirmation use equal wall-clock budgets and at most 1500 iterations. CPU worker count is fixed. Deadline stops dispatching fresh work; running games finish.'};
  if(existsSync(planFile)){
    if(JSON.stringify(readJSON(planFile))!==JSON.stringify(plan))throw new Error('Cannot resume with changed plan or sources');
  }else saveJSON(planFile,plan);
  const checkSources=()=>{for(const [p,h] of Object.entries(sources))if(digest(readFileSync(p))!==h)throw new Error('Source changed during run: '+p);};
  const expired=()=>Date.now()>=Date.parse(deadline);
  const status=(stage:string,data:object={})=>{checkSources();saveJSON(statusFile,{stage,updatedAt:new Date().toISOString(),deadline,...data});console.log(JSON.stringify({stage,...data}));};
  const jobs:TrainingJob[]=[];for(let index=0;index<config.gamesPerCount;index++)for(const players of [3,4,5] as const)jobs.push({players,index});
  const trainSeeds=new Set<number>();
  for(const job of jobs){const seed=deriveSeed(deriveSeed(config.seed,job.players),job.index);if(trainSeeds.has(seed))throw new Error('Duplicate training environment');trainSeeds.add(seed);}
  const old=getReleasedNeuralModel().toJSON().metadata;
  for(const seed of [...old.trainingGameSeeds as number[]??[],...old.validationGameSeeds as number[]??[]])if(trainSeeds.has(seed))throw new Error('Legacy training overlap');
  for(const [kind,stage] of [['generate','trajectories'],['label','labels']] as const){
    mkdirSync(join(directory,stage),{recursive:true});
    let done=jobs.filter(j=>existsSync(gamePath(directory,stage,j.players,j.index))).length;
    const pending=jobs.filter(j=>!existsSync(gamePath(directory,stage,j.players,j.index)));
    status(stage,{finished:done,total:jobs.length});
    // Batches allow checkpointing the deadline without interrupting a valid game or label set.
    for(let start=0;start<pending.length;start+=workers*2){
      if(expired()){status('paused-deadline',{pendingStage:stage,finished:done,total:jobs.length});return;}
      await runWorkerPool(entry,{kind,config},pending.slice(start,start+workers*2),workers,(job,result)=>{
        saveJSON(gamePath(directory,stage,job.players,job.index),result);done++;status(stage,{finished:done,total:jobs.length});
      });
    }
  }
  const games=jobs.map(j=>readJSON<Labelled>(gamePath(directory,'labels',j.players,j.index)));
  for(const game of games){
    if(game.labelIterations!==config.teacherIterations||game.sourceHash!==digest(readFileSync(gamePath(directory,'trajectories',game.players,game.index))))throw new Error('Label provenance mismatch');
  }
  const models=join(directory,'models');
  if(!existsSync(join(models,'training-report.json'))){
    if(expired()){status('paused-deadline',{pendingStage:'training'});return;}
    status('training');trainMultiplayer(games,models,deriveSeed(config.seed,91),epochs);
  }
  const modelHashes=Object.fromEntries(['visits','q','value'].map(k=>[k,digest(readFileSync(join(models,k+'.json')))]));
  const pilot:EvalConfig={seed:deriveSeed(config.seed,92),rotations:pilotRotations,budgetMs:pilotBudget,iterations:0,directory:join(directory,'pilot'),models};
  const confirm:EvalConfig={...pilot,seed:deriveSeed(config.seed,93),rotations:confirmRotations,budgetMs:650,directory:join(directory,'confirmation')};
  const occupied=new Set(trainSeeds);
  for(const setup of [pilot,confirm])for(const n of [3,4,5] as const)for(let i=0;i<setup.rotations;i++){
    const s=deriveSeed(deriveSeed(setup.seed,n),i);if(occupied.has(s))throw new Error('Arena seed overlap');occupied.add(s);
  }
  const evaluate=async(setup:EvalConfig,picks:Record<number,EvalVariant[]>)=>{
    mkdirSync(setup.directory,{recursive:true});
    const jobs:TrainingJob[]=[];
    for(let index=0;index<setup.rotations*5;index++)for(const players of [3,4,5] as const)if(index<setup.rotations*players)for(const variant of picks[players]!)jobs.push({players,index,variant});
    const filename=(j:TrainingJob)=>join(setup.directory,j.players+'p-'+j.variant+'-'+j.index+'.json');
    saveJSON(join(setup.directory,'plan.json'),{setup,picks,jobs,modelHashes,sourcePlanHash:digest(readFileSync(planFile))});
    let done=jobs.filter(j=>existsSync(filename(j))).length;
    const pending=jobs.filter(j=>!existsSync(filename(j)));
    const stage=setup===pilot?'pilot':'confirmation';
    status(stage,{finished:done,total:jobs.length});
    for(let start=0;start<pending.length;start+=workers*2){
      if(expired()){status('paused-deadline',{pendingStage:stage,finished:done,total:jobs.length});return null;}
      await runWorkerPool(entry,{kind:'evaluate',config:setup},pending.slice(start,start+workers*2),workers,(job,result)=>{
        saveJSON(filename(job),result);done++;status(stage,{finished:done,total:jobs.length});
      });
    }
    const rows=jobs.map(j=>readJSON(filename(j))),results:any[]=[];
    for(const n of [3,4,5] as const){
      if(!picks[n]!.length)continue;
      const byVariant=Object.fromEntries(picks[n]!.map(v=>[v,rows.filter(r=>r.players===n&&r.variant===v).sort((a,b)=>a.record.gameIndex-b.record.gameIndex)]));
      results.push({players:n,overall:Object.fromEntries(Object.entries(byVariant).map(([v,r])=>[v,summarizeArena(evaluationOptions(setup,n),r.map(x=>x.record)).overall])),
        comparisons:Object.fromEntries(picks[n]!.filter(v=>v!=='control').map(v=>[v,pairedComparison(byVariant[v]!.map(x=>x.record),byVariant.control!.map(x=>x.record),setup.seed)])),
        inference:Object.fromEntries(Object.entries(byVariant).map(([v,r])=>[v,{policyCalls:r.reduce((s,x)=>s+x.policyCalls,0),valueCalls:r.reduce((s,x)=>s+x.valueCalls,0),iterations:r.reduce((s,x)=>s+x.iterations,0),searches:r.reduce((s,x)=>s+x.searches,0)}]))});
    }
    for(const [k,h] of Object.entries(modelHashes))if(digest(readFileSync(join(models,k+'.json')))!==h)throw new Error('Model changed during evaluation');
    saveJSON(join(setup.directory,'result.json'),{setup,results,modelHashes,complete:true});return results;
  };
  const pilotResults=await evaluate(pilot,{3:variants,4:variants,5:variants});if(!pilotResults)return;
  const selected:Record<number,EvalVariant[]>={3:[],4:[],5:[]};
  for(const result of pilotResults){
    const order=([...(['visits','q','visitsValue'] as const)]).sort((a,b)=>result.overall[b].winCredit-result.overall[a].winCredit||result.overall[b].meanScoreMargin-result.overall[a].meanScoreMargin);
    const best=order[0]!;
    if(result.overall[best].winCredit>result.overall.control.winCredit)selected[result.players]=['control',best];
  }
  saveJSON(join(directory,'selection.json'),{selected,reason:plan.selection,decidedAt:new Date().toISOString(),pilotHash:digest(readFileSync(join(pilot.directory,'result.json')))});
  if(Object.values(selected).every(v=>!v.length)){status('completed-no-promotion',{reason:'No trained candidate exceeded control in the pilot',modelHashes});return;}
  const confirmation=await evaluate(confirm,selected);if(!confirmation)return;
  const evidence=confirmation.map(r=>({players:r.players,comparison:r.comparisons[selected[r.players]![1]!]}));
  status('completed',{selected,evidence,modelHashes,deployment:'None. Human-readable review and browser checks still required; this finite test does not establish all-configuration superiority.'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{await runNightly();}catch(error){
    const at=process.argv.indexOf('--output'),directory=resolve(at>=0?process.argv[at+1]!:'work/neural-multiplayer-20260912/nightly-v1');
    if(existsSync(directory))saveJSON(join(directory,'failure.json'),{date:new Date().toISOString(),message:error instanceof Error?error.stack:String(error)});
    throw error;
  }
}
