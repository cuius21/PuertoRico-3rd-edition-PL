import type { GameState } from './GameState';
import type { PlayerId } from '../core/types';

// Rozbicie wyniku gracza na składniki — przydatne do wyświetlenia w UI.
export interface PlayerScore {
  playerId: PlayerId;
  playerName: string;

  // Żetony PZ zebrane podczas fazy kapitana.
  vpTokens: number;

  // Suma PZ wydrukowanych na wszystkich posiadanych budynkach
  // (liczone niezależnie od aktywacji).
  buildingVP: number;

  // Bonus końcowy z dużych budynków (Twierdza, Siedziba Cechu, Urząd Celny,
  // Ratusz, Rezydencja) — liczony TYLKO jeśli budynek jest aktywny (ma robotnika).
  largeBuildingBonus: number;

  // Łączny wynik: vpTokens + buildingVP + largeBuildingBonus.
  total: number;

  // Remis-breaker 1: dublony (więcej = lepsza pozycja).
  doubloons: number;

  // Remis-breaker 2: towary (więcej = lepsza pozycja).
  goods: number;

  // Miejsce po posortowaniu (1 = zwycięzca).
  rank: number;
}

export class ScoreCalculator {
  // Oblicza wyniki wszystkich graczy i zwraca je posortowane (najlepszy wynik na początku).
  // Rozwiązywanie remisów: 1) więcej PZ, 2) więcej dublonów, 3) więcej towarów.
  static calculate(state: GameState): PlayerScore[] {
    const scores: PlayerScore[] = state.players.map(player => {
      const vpTokens = player.victoryPointTokens;
      let buildingVP = 0;
      let largeBuildingBonus = 0;

      for (const building of player.island.getBuildings()) {
        buildingVP += building.victoryPoints;

        // Bonus dużego budynku — wyłącznie gdy budynek jest aktywny (ma robotnika).
        if (building.isActive() && building.calculateEndGameBonus) {
          largeBuildingBonus += building.calculateEndGameBonus(state, player);
        }
      }

      return {
        playerId: player.id,
        playerName: player.name,
        vpTokens,
        buildingVP,
        largeBuildingBonus,
        total: vpTokens + buildingVP + largeBuildingBonus,
        doubloons: player.doubloons,
        goods: player.getTotalStoredGoods(),
        rank: 0, // wypełnimy poniżej
      };
    });

    // Sortowanie: wynik ↓, dublony ↓, towary ↓
    scores.sort((a, b) => {
      if (b.total !== a.total)      return b.total - a.total;
      if (b.doubloons !== a.doubloons) return b.doubloons - a.doubloons;
      return b.goods - a.goods;
    });

    // Przypisz miejsce (gracze z takim samym wynikiem i remis-breakerami dzielą rangę)
    for (let i = 0; i < scores.length; i++) {
      if (i === 0) {
        scores[i]!.rank = 1;
      } else {
        const prev = scores[i - 1]!;
        const cur  = scores[i]!;
        const tied =
          cur.total     === prev.total &&
          cur.doubloons === prev.doubloons &&
          cur.goods     === prev.goods;
        cur.rank = tied ? prev.rank : i + 1;
      }
    }

    return scores;
  }

  // Zwraca zwycięzcę (lub zwycięzców przy pełnym remisie).
  static getWinners(state: GameState): PlayerScore[] {
    const scores = ScoreCalculator.calculate(state);
    const topRank = scores[0]!.rank;
    return scores.filter(s => s.rank === topRank);
  }

  // Wypisuje wyniki na konsolę (do testów / demoscenariuszy).
  static printSummary(state: GameState): void {
    const scores = ScoreCalculator.calculate(state);
    console.log('\n=== WYNIKI KOŃCOWE ===');
    for (const s of scores) {
      const detail =
        `żetony=${s.vpTokens}  budynki=${s.buildingVP}  bonus=${s.largeBuildingBonus}` +
        `  remisBrk:(${s.doubloons}ψ, ${s.goods}towarów)`;
      console.log(
        `  #${s.rank}  ${s.playerName.padEnd(10)}  ${String(s.total).padStart(3)} PZ   ${detail}`,
      );
    }
    const winners = scores.filter(s => s.rank === 1).map(s => s.playerName).join(', ');
    console.log(`\nZwycięzca: ${winners}`);
  }
}
