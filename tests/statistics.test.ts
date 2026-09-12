import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { GameRunner } from '../src/game/GameRunner';
import { GreedyBot } from '../src/bots/GreedyBot';
import { NeuralBot } from '../src/bots/NeuralBot';
import { MatchRecorder, snapshot } from '../src/statistics/recorder';
import { applyChanges, diff } from '../src/statistics/delta';
import { recordings } from '../src/statistics/store';
import { serializeGame, getSavedGame, deserializeGame } from '../src/game/GameSerializer';
import { describeAction } from '../src/game/actionLabels';
import { validateReport } from '../statistics-server/validation';
import worker, { type Database, type Env, type Statement } from '../statistics-server/worker';
import type { MatchReport } from '../src/statistics/types';

const expansions = { festival: false, corsair: false, newBuildings: false, nobleBuildings: false };
function storage() {
  const data = new Map<string,string>();
  return { getItem: (k:string) => data.get(k) ?? null, setItem: (k:string,v:string) => { data.set(k,String(v)); },
    removeItem: (k:string) => { data.delete(k); }, key: (n:number) => [...data.keys()][n] ?? null, get length() { return data.size; }, clear: () => data.clear() };
}
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../statistics-server/schema.sql', import.meta.url), 'utf8'));
  const wrapper: Database = {
    prepare(sql: string) {
      let bindings: (string | number | null)[] = [];
      const stmt: Statement = {
        bind(...values) { bindings = values as typeof bindings; return stmt; },
        async all() { return { results: db.prepare(sql).all(...bindings) as Record<string,unknown>[] }; },
        async run() { const r=db.prepare(sql).run(...bindings); return { results: [], meta: { changes: Number(r.changes) } }; },
      };
      return stmt;
    },
    async batch(statements) { return Promise.all(statements.map(s => s.all())); },
  };
  return { db, env: { STATS_DB: wrapper, ASSETS: { fetch: async () => new Response('asset') } } satisfies Env };
}
function request(path: string, report?: MatchReport) {
  return new Request('https://game.example'+path, report ? { method:'POST', headers:{Origin:'https://game.example','Content-Type':'application/json'}, body:JSON.stringify(report) } : {});
}
const reports: MatchReport[] = [];
beforeAll(() => {
  for (const count of [3,4,5]) {
    const setups = Array.from({length: count},(_,i)=>({type:'bot' as const,name:'PRIVATE-NAME-'+i,bot:new GreedyBot()}));
    const runner = new GameRunner(setups);
    const recorder = new MatchRecorder(runner.state, setups, expansions, false, false);
    while (!runner.state.gameOver && recorder.data.actionCount < 8000) {
      const action = runner.getBotAction()!;
      const move = recorder.before(action, describeAction(action,runner.state));
      expect(runner.applyAction(action,'')).toBe(true);
      recorder.after(move);
    }
    expect(runner.state.gameOver).toBe(true);
    reports.push(recorder.report()!);
  }
}, 60_000);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Match recorder', () => {
  it('records complete games for 3, 4 and 5 seats, including automatic changes, with no names', () => {
    for (const report of reports) {
      expect(validateReport(report).players).toEqual(report.players);
      expect(JSON.stringify(report)).not.toContain('PRIVATE-NAME');
      expect(report.history.complete).toBe(true);
      expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeLessThan(1_200_000);
      let state = report.history.initial;
      for (const move of report.history.moves) state=applyChanges(state,move.changes);
      expect(state).toEqual(report.history.final);
      expect(report.players.filter(p=>p.rank===1).length).toBeGreaterThan(0);
    }
  });
  it('preserves identity and history on save/resume and does not mutate engine snapshots', () => {
    vi.stubGlobal('localStorage',storage());
    const setups = Array.from({length:3},()=>({type:'bot' as const,name:'secret',bot:new GreedyBot()}));
    const runner = new GameRunner(setups), recorder=new MatchRecorder(runner.state,setups,expansions,false,false);
    const before=snapshot(runner.state), action=runner.getBotAction()!, move=recorder.before(action,'Role');
    expect(snapshot(runner.state)).toEqual(before);
    runner.applyAction(action,''); recorder.after(move);
    serializeGame(runner.state,setups);
    const loaded=deserializeGame(getSavedGame()!);
    const restored=new MatchRecorder(loaded.state,loaded.setups,expansions,true,false);
    expect(restored.data.id).toBe(recorder.data.id);
    expect(restored.data.moves).toEqual(recorder.data.moves);
    expect(restored.data.historyComplete).toBe(true);
    expect(recordings.get(loaded.state)).toBe(restored.data);
  });
  it('marks old saves partial and excludes practice games, including after resume', () => {
    const setups=Array.from({length:3},()=>({type:'bot' as const,name:'A',bot:new GreedyBot()}));
    const runner=new GameRunner(setups);
    const recorder=new MatchRecorder(runner.state,setups,expansions,true,true);
    runner.state.gameOver=true;
    expect(recorder.data.historyComplete).toBe(false);
    expect(recorder.report()).toBeNull();
    const resumed=new MatchRecorder(runner.state,setups,expansions,true,false);
    expect(resumed.report()).toBeNull();
  });
  it('records a full expanded game, including noble workers and corsair actions', () => {
    const setups=Array.from({length:4},()=>({type:'bot' as const,name:'PRIVATE-NAME',bot:new GreedyBot()}));
    const expanded={festival:true,corsair:true,newBuildings:true,nobleBuildings:true};
    const runner=new GameRunner(setups,undefined,expanded);
    const recorder=new MatchRecorder(runner.state,setups,expanded,false,false);
    while(!runner.state.gameOver && recorder.data.actionCount<8000){
      const action=runner.getBotAction()!;const move=recorder.before(action,describeAction(action,runner.state));
      expect(runner.applyAction(action,'')).toBe(true);recorder.after(move);
    }
    expect(runner.state.gameOver).toBe(true);
    const report=recorder.report()!;
    expect(validateReport(report).expansions).toEqual(expanded);
    let state=report.history.initial;for(const move of report.history.moves)state=applyChanges(state,move.changes);
    expect(state).toEqual(report.history.final);
    expect(JSON.stringify(report)).not.toContain('PRIVATE-NAME');
  });
  it('keeps the playable save and match ID when the history exceeds storage quota', () => {
    const original=storage();
    vi.stubGlobal('localStorage',{...original,setItem:(key:string,value:string)=>{if(JSON.parse(value).recording?.moves.length)throw new Error('quota');original.setItem(key,value)}});
    const setups=Array.from({length:3},()=>({type:'bot' as const,name:'A',bot:new GreedyBot()}));
    const runner=new GameRunner(setups),recorder=new MatchRecorder(runner.state,setups,expansions,false,false);
    const action=runner.getBotAction()!,move=recorder.before(action,'Role');runner.applyAction(action,'');recorder.after(move);
    serializeGame(runner.state,setups);
    const save=getSavedGame()!;
    expect(save.recording!.id).toBe(recorder.data.id);expect(save.recording!.historyReason).toBe('storage-limit');
    expect(recorder.data.moves.length).toBe(1);
    const loaded=deserializeGame(save),resumed=new MatchRecorder(loaded.state,loaded.setups,expansions,true,false);
    expect(snapshot(loaded.state)).toEqual(snapshot(runner.state));expect(resumed.data.historyComplete).toBe(false);
  });
  it('detects expansions in old saves even when all aqueducts have been bought', () => {
    const setups=Array.from({length:3},()=>({type:'bot' as const,name:'A',bot:new NeuralBot()}));
    const runner=new GameRunner(setups,undefined,{...expansions,newBuildings:true});
    while(runner.state.supply.takeBuilding('aqueduct')) {}
    const recorder=new MatchRecorder(runner.state,setups,expansions,true,false);
    expect(recorder.data.expansions.newBuildings).toBe(true);
    expect(recorder.data.players[0]!.effective).toBe('hardcore');
  });
  it('records Neural fallback for 4/5 players and expansions', () => {
    for (const [count,expanded] of [[3,false],[4,false],[5,false],[3,true]] as const) {
      const setups=Array.from({length:count},()=>({type:'bot' as const,name:'A',bot:new NeuralBot()}));
      const config={...expansions,festival:expanded};
      const runner=new GameRunner(setups,undefined,config);
      const recorder=new MatchRecorder(runner.state,setups,config,false,false);
      expect(recorder.data.players[0]!.selected).toBe('neural');
      expect(recorder.data.players[0]!.effective).toBe(count===3&&!expanded?'neural':'hardcore');
    }
  });
  it('round-trips changes with deletions, arrays and rejects prototype paths', () => {
    const before={a:[1,{nested:2}],deleted:1},after={a:[2,{nested:3}],new:true};
    expect(applyChanges(before,diff(before,after))).toEqual(after);
    expect(()=>applyChanges({},[{path:['__proto__','polluted'],value:true}])).toThrow();
  });
});

describe('Statistics API and real SQLite queries', () => {
  it('deduplicates retries, splits ties, filters tables and keeps history private', async () => {
    const {db,env}=database();
    try {
      const tie=structuredClone(reports[0]!);
      tie.players.forEach(p=>Object.assign(p,{total:20,vpTokens:20,buildingVP:0,largeBuildingBonus:0,nobleVP:0,doubloons:5,goods:1,rank:5}));
      Object.assign(tie.players[0]!,{kind:'human',selected:'human',effective:'human'});
      for(let i=0;i<3;i++) expect((await worker.fetch(request('/api/matches',tie),env)).status).toBe(i===0?201:200);
      for(const report of reports.slice(1)) expect((await worker.fetch(request('/api/matches',report),env)).status).toBe(201);
      const all=await (await worker.fetch(request('/api/stats'),env)).json() as any;
      expect(all.games).toBe(3); expect(all.ties).toBe(1);
      expect(all.humanWins).toBeCloseTo(1/3); expect(all.botWins).toBeCloseTo(8/3);
      expect(all.levels.reduce((sum:number,l:any)=>sum+l.appearances,0)).toBe(12);
      const mixed=await (await worker.fetch(request('/api/stats?kind=mixed&players=3&expansions=base'),env)).json() as any;
      expect(mixed.games).toBe(1);
      expect(mixed.levels.find((l:any)=>l.level==='human').wins).toBeCloseTo(1/3);
      expect(mixed.levels.find((l:any)=>l.level==='hard').appearances).toBe(2);
      expect((await worker.fetch(request('/api/matches/'+tie.id),env)).status).toBe(404);
      expect((await worker.fetch(request('/api/matches'),env)).status).toBe(404);
      expect((await worker.fetch(request('/api/stats?players=3%20OR%201=1'),env)).status).toBe(400);
      expect(db.prepare('SELECT COUNT(*) n FROM matches').get()!.n).toBe(3);
    } finally { db.close(); }
  });
  it('rejects bad origins, malformed results, forged fallback and overlarge requests', async () => {
    const {db,env}=database();
    try {
      const badOrigin=request('/api/matches',reports[0]); badOrigin.headers.set('Origin','https://other.example');
      expect((await worker.fetch(badOrigin,env)).status).toBe(403);
      const bad=structuredClone(reports[1]!); bad.players[0]!.total++;
      expect((await worker.fetch(request('/api/matches',bad),env)).status).toBe(400);
      const fallback=structuredClone(reports[1]!); fallback.players[0]!.selected='neural';fallback.players[0]!.effective='neural';
      expect(()=>validateReport(fallback)).toThrow();
      const named=structuredClone(reports[0]!); (named.history.initial as any).name='Private';
      expect(()=>validateReport(named)).toThrow();
      const huge=request('/api/matches',reports[0]);huge.headers.set('Content-Length','1200001');
      expect((await worker.fetch(huge,env)).status).toBe(400);
      expect(db.prepare('SELECT COUNT(*) n FROM matches').get()!.n).toBe(0);
    } finally { db.close(); }
  });
  it('has an empty initial summary and falls back to static assets', async () => {
    const {db,env}=database();
    try {
      const data=await (await worker.fetch(request('/api/stats'),env)).json() as any;
      expect(data).toMatchObject({games:0,humanWins:0,botWins:0,ties:0,levels:[],configurations:[]});
      expect(await (await worker.fetch(request('/'),env)).text()).toBe('asset');
    } finally { db.close(); }
  });
});

describe('Durable result delivery', () => {
  it('keeps failed uploads in local storage and resumes after module reload, without double counting', async () => {
    vi.stubGlobal('localStorage',storage()); vi.resetModules();
    const report=reports[0]!;
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    let transport=await import('../src/statistics/transport');
    transport.enqueueMatch(report);
    await vi.waitFor(()=>expect(transport.matchStatus(report.id)).toContain('czeka'));
    expect(localStorage.getItem('puerto-stats-pending:'+report.id)).not.toBeNull();
    vi.resetModules();
    const fetchMock=vi.fn().mockResolvedValue(Response.json({id:report.id,saved:true}));
    vi.stubGlobal('fetch',fetchMock);
    transport=await import('../src/statistics/transport');
    await transport.flushMatches();
    expect(localStorage.getItem('puerto-stats-pending:'+report.id)).toBeNull();
    transport.enqueueMatch(report); await transport.flushMatches();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

