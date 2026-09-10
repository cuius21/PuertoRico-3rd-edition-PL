import { afterEach, describe, expect, it, vi } from 'vitest';
import { MayorSearchBot } from '../../src/bots/MayorSearchBot';
import { generateMayorPlans, mayorAllocationSignature } from '../../src/bots/mayorPlans';
import { chooseHeuristicAction, hardcoreActionKey } from '../../src/bots/hardcorePolicy';
import * as evaluation from '../../src/bots/hardcoreEvaluation';
import { cloneGameState } from '../../src/bots/simulation';
import { serializeGameState, deserializeGameState } from '../../src/game/GameSerializer';
import { seededRandom } from '../../tools/arena-core';
import { SmallIndigoPlant, SmallSugarMill, TobaccoStorage, CoffeeRoaster } from '../../domain/buildings/catalog/ProductionBuildings';
import { Factory, Harbour, LargeMarket } from '../../domain/buildings/catalog/SmallUtilityBuildings';
import { Plantation } from '../../domain/Plantation';
import { GoodType, PhaseType, PlantationType } from '../../core/types';
import { MayorPhase } from '../../state/phases/MayorPhase';
import { GameFactory } from '../../state/GameFactory';
import { RoleSelectionPhase } from '../../state/phases/RoleSelectionPhase';
import type { GameState } from '../../state/GameState';
import type { Bot } from '../../src/bots/Bot';

const base = { festival: false, corsair: false, newBuildings: false, nobleBuildings: false };
function state(players: 3 | 4 | 5 = 3) {
  return GameFactory.create(players, ['A','B','C','D','E'].slice(0,players), new RoleSelectionPhase(), base);
}
function scarce() {
  const game = state(), player = game.players[0]!;
  player.island.restorePlantationSlots([PlantationType.Indigo, PlantationType.Sugar, PlantationType.Tobacco, PlantationType.Coffee].map(type => new Plantation(type)));
  for (const Building of [SmallIndigoPlant, SmallSugarMill, TobaccoStorage, CoffeeRoaster, Factory, Harbour, LargeMarket]) player.island.addBuilding(new Building());
  game.restorePhase(new MayorPhase()); player.pendingWorkers = 3;
  return game;
}
function finish(game: GameState, bot?: Bot) {
  const pid = game.getCurrentPlayer().id, trace: string[] = [];
  while (!game.gameOver && game.getCurrentPhase().type === PhaseType.Mayor && game.getCurrentPlayer().id === pid) {
    expect(trace.length).toBeLessThan(60);
    const action = bot ? bot.chooseAction(game,pid) : chooseHeuristicAction(game,pid);
    expect(action.validate(game).ok).toBe(true); trace.push(hardcoreActionKey(action));
    expect(game.apply(action).ok).toBe(true);
  }
  return trace;
}
afterEach(() => vi.restoreAllMocks());
describe('complete Mayor staffing search', () => {
  it('always contains the exact old Hardcore trace and no duplicate final allocations', () => {
    const game=scarce(), pid=game.getCurrentPlayer().id, before=serializeGameState(game);
    const plans=generateMayorPlans(game,pid,8);
    expect(plans.length).toBeGreaterThan(1); expect(plans.length).toBeLessThanOrEqual(8);
    expect(plans[0]!.baseline).toBe(true);
    expect(plans[0]!.actionKeys).toEqual(finish(cloneGameState(game)));
    expect(new Set(plans.map(plan=>plan.signature)).size).toBe(plans.length);
    expect(serializeGameState(game)).toEqual(before);
  });
  it('constructs legal complete plans and includes a working production alternative', () => {
    const game=scarce(), pid=game.getCurrentPlayer().id, plans=generateMayorPlans(game,pid,8);
    let producing=false;
    for(const plan of plans) {
      const sim=cloneGameState(game);
      for(const key of plan.actionKeys) {
        expect(sim.getCurrentPhase().type).toBe(PhaseType.Mayor); expect(sim.getCurrentPlayer().id).toBe(pid);
        const action=sim.getValidActions(pid).find(candidate=>hardcoreActionKey(candidate)===key)!;
        expect(action).toBeDefined(); expect(sim.apply(action).ok).toBe(true);
      }
      expect(sim.getCurrentPhase().type!==PhaseType.Mayor || sim.getCurrentPlayer().id!==pid).toBe(true);
      expect(mayorAllocationSignature(sim.getPlayer(pid)!)).toBe(plan.signature);
      producing ||= Object.values(GoodType).some(good=>sim.getPlayer(pid)!.island.getProductionCapacity(good)>0);
    }
    expect(producing).toBe(true);
  });
  it('does not change the board or consume the host RNG and repeats an uncommitted move from cache', () => {
    const game=scarce(), pid=game.getCurrentPlayer().id, before=serializeGameState(game);
    const bot=new MayorSearchBot({timeBudgetMs:Infinity,maxBatches:1,random:seededRandom(17)});
    const spy=vi.spyOn(Math,'random'); const first=bot.chooseAction(game,pid);
    expect(serializeGameState(game)).toEqual(before); expect(spy).not.toHaveBeenCalled();
    expect(bot.lastMayorStats!.errors).toBe(0);
    expect(hardcoreActionKey(bot.chooseAction(game,pid))).toBe(hardcoreActionKey(first));
    expect(bot.lastMayorStats!.cacheHit).toBe(true); expect(bot.lastMayorStats!.rollouts).toBe(0);
  });
  it('uses one cached plan for the entire staffing turn', () => {
    const game=scarce(),pid=game.getCurrentPlayer().id,bot=new MayorSearchBot({timeBudgetMs:Infinity,maxBatches:1,random:seededRandom(19)});
    const first=bot.chooseAction(game,pid); expect(game.apply(first).ok).toBe(true);
    while(game.getCurrentPhase().type===PhaseType.Mayor && game.getCurrentPlayer().id===pid) {
      const action=bot.chooseAction(game,pid); expect(bot.lastMayorStats!.cacheHit).toBe(true);
      expect(bot.lastMayorStats!.batches).toBe(0); expect(bot.lastMayorStats!.rollouts).toBe(0);
      expect(game.apply(action).ok).toBe(true);
    }
  });
  it('keeps the exact old trace when no rollout budget is available', () => {
    const game=scarce(), expected=finish(cloneGameState(game));
    expect(finish(game,new MayorSearchBot({timeBudgetMs:0,maxBatches:0,random:()=>{throw new Error('No random sampling expected');}}))).toEqual(expected);
  });
  it('does not reuse a stale full plan after a reload or outside mutation', () => {
    const game=scarce(),pid=game.getCurrentPlayer().id;
    const choose=vi.fn((position: GameState,id: string)=>chooseHeuristicAction(position,id));
    const bot=new MayorSearchBot({delegate:{name:'delegate',chooseAction:choose},timeBudgetMs:Infinity,maxBatches:1,random:seededRandom(21)});
    expect(game.apply(bot.chooseAction(game,pid)).ok).toBe(true);
    const restored=deserializeGameState(serializeGameState(game));
    bot.chooseAction(restored,pid); expect(bot.lastMayorStats!.cacheHit).toBe(false); expect(choose).toHaveBeenCalledTimes(1);
    game.players[0]!.doubloons++;
    bot.chooseAction(game,pid); expect(bot.lastMayorStats!.cacheHit).toBe(false); expect(choose).toHaveBeenCalledTimes(2);
  });
  it.each([4,5] as const)('delegates unsupported %i-player games without running the planner', players => {
    const game=state(players);game.restorePhase(new MayorPhase());game.players[0]!.pendingWorkers=1;
    const choose=vi.fn((position:GameState,id:string)=>position.getValidActions(id)[0]!);
    const bot=new MayorSearchBot({delegate:{name:'delegate',chooseAction:choose}});
    expect(bot.chooseAction(game,game.getCurrentPlayer().id).validate(game).ok).toBe(true);
    expect(choose).toHaveBeenCalledOnce();expect(bot.lastMayorStats).toBeNull();
  });
  it('delegates non-Mayor phases and clears Mayor diagnostics', () => {
    const game=state(),choose=vi.fn((position:GameState,id:string)=>position.getValidActions(id)[0]!);
    const bot=new MayorSearchBot({delegate:{name:'delegate',chooseAction:choose}});
    bot.chooseAction(game,game.getCurrentPlayer().id);expect(choose).toHaveBeenCalledOnce();expect(bot.lastMayorStats).toBeNull();
  });
  it('returns to the baseline if an evaluation fails after a successful batch', () => {
    const game=scarce(),pid=game.getCurrentPlayer().id,count=generateMayorPlans(game,pid,8).length;
    let calls=0;
    vi.spyOn(evaluation,'evaluateHardcoreState').mockImplementation(()=>{
      if(++calls>count)throw new Error('Injected second-batch failure');
      return calls===1?[.1,.45,.45]:[.8,.1,.1];
    });
    const bot=new MayorSearchBot({timeBudgetMs:Infinity,maxBatches:2,candidateCount:8,random:seededRandom(23)});
    const action=bot.chooseAction(game,pid);
    expect(action.validate(game).ok).toBe(true);expect(bot.lastMayorStats!.batches).toBe(1);
    expect(bot.lastMayorStats!.errors).toBeGreaterThan(0);expect(bot.lastMayorStats!.selectedBaseline).toBe(true);
  });
});
