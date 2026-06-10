import { Player } from '../domain/Player';
import { Supply } from '../domain/Supply';
import { Ship } from '../domain/Ship';
import { TradingHouse } from '../domain/TradingHouse';
import { RoleCard } from '../domain/RoleCard';
import type { FestivalBoard } from '../domain/FestivalBoard';
import type { GamePhase } from './GamePhase';
import type { Action } from '../actions/Action';
import { type Result, Err, OkVoid } from '../core/Result';
import { type PlayerId, RoleType } from '../core/types';

// Centralny kontener stanu gry. Jedyne miejsce, w którym mutacje są aplikowane
// (przez GameState.apply). Cała logika decyzyjna delegowana do aktualnej fazy.
//
// MVP: mutowalny, hot-seat, jeden proces. Brak serializacji - dodamy gdy będzie potrzebna.
export class GameState {
  private currentPhase!: GamePhase;

  // Indeks gracza pełniącego rolę gubernatora (rozpoczyna rundę).
  governorIndex: number = 0;

  // Kto WYBRAŁ aktualnie wykonywaną postać - potrzebne dla przywileju.
  roleSelectorIndex: number = 0;

  // Indeks gracza, który aktualnie wykonuje sub-akcję w fazie.
  // W fazie postaci - przesuwa się zgodnie z ruchem wskazówek zegara
  // od selektora przez wszystkich graczy.
  currentPlayerIndex: number = 0;

  // Numer rundy - przyda się do logów/debug.
  roundNumber: number = 0;

  gameOver: boolean = false;
  gameOverReason: string = '';

  // Plansza festynu (Rozszerzenie IV) — null jeśli rozszerzenie wyłączone
  festivalBoard: FestivalBoard | null = null;

  // Rozszerzenie II: Szlachcic aktywny
  nobleExpansion: boolean = false;

  // Rozszerzenie III: Korsarz
  // Gracz, który aktualnie posiada żeton korsarza (nie może ponownie wybrać Korsarza).
  corsairTokenHolderId: PlayerId | null = null;
  // Karta pojmana przez Korsarza w bieżącej rundzie (Pojmanie).
  capturedRoleCard: RoleType | null = null;

  // Faza kapitana: true gdy gracz z aktywnym magazynem czeka na wybór typów towaru do zachowania.
  captainStoragePending: boolean = false;

  // Log akcji - przyda się do debug, testów regresyjnych i (w przyszłości) replay.
  readonly actionLog: Action[] = [];

  constructor(
    readonly players: Player[],
    readonly supply: Supply,
    readonly ships: Ship[],
    readonly tradingHouse: TradingHouse,
    readonly roleCards: RoleCard[],
    initialPhase: GamePhase,
  ) {
    this.setPhase(initialPhase);
  }

  // === FAZY ===

  getCurrentPhase(): GamePhase {
    return this.currentPhase;
  }

  // Wymiana fazy z hookami onEnter/onExit. Bezpieczna kolejność:
  // 1. wyjście ze starej fazy, 2. ustawienie pola, 3. wejście do nowej.
  setPhase(phase: GamePhase): void {
    this.currentPhase?.onExit(this);
    this.currentPhase = phase;
    phase.onEnter(this);
  }

  // === AKCJE ===

  // Główny entry point dla wszystkich mutacji.
  // 1) waliduje, 2) wykonuje, 3) loguje, 4) sprawdza przejście fazy.
  apply(action: Action): Result<void, string> {
    if (this.gameOver) return Err('Game is over');

    const validation = action.validate(this);
    if (!validation.ok) return validation;

    action.execute(this);
    this.actionLog.push(action);

    // Po każdej akcji - faza decyduje, czy zmieniamy stan.
    // Pętla: faza może natychmiast przejść do kolejnej (np. pusta faza poszukiwacza).
    while (true) {
      const nextPhase = this.currentPhase.checkTransition(this);
      if (nextPhase === null) break;
      this.setPhase(nextPhase);
    }

    return OkVoid;
  }

  // API dla UI/AI - zapytaj fazę o legalne akcje gracza.
  getValidActions(playerId: PlayerId): Action[] {
    return this.currentPhase.getValidActions(this, playerId);
  }

  // === ZAPYTANIA ===

  getCurrentPlayer(): Player {
    return this.players[this.currentPlayerIndex]!;
  }

  getRoleSelector(): Player {
    return this.players[this.roleSelectorIndex]!;
  }

  getGovernor(): Player {
    return this.players[this.governorIndex]!;
  }

  getPlayer(playerId: PlayerId): Player | undefined {
    return this.players.find(p => p.id === playerId);
  }

  // Indeks gracza po PlayerId (-1 jeśli brak).
  getPlayerIndex(playerId: PlayerId): number {
    return this.players.findIndex(p => p.id === playerId);
  }

  // Aktualnie wykonywana postać (jeśli jakaś faza postaci aktywna).
  getActiveRole(): RoleType | null {
    const card = this.roleCards.find(c => c.takenBy === this.players[this.roleSelectorIndex]!.id);
    return card?.type ?? null;
  }

  // Karty postaci, które wciąż są wolne do wyboru w tej rundzie.
  getAvailableRoleCards(): readonly RoleCard[] {
    return this.roleCards.filter(c => c.isAvailable());
  }

  // === STEROWANIE TURĄ ===

  // Przesuwa wskaźnik aktualnego gracza zgodnie z ruchem wskazówek zegara.
  advanceCurrentPlayer(): void {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  // Czy currentPlayerIndex wrócił do selektora (= wszyscy wykonali akcję w tej fazie).
  hasCompletedRoundOfActions(): boolean {
    return this.currentPlayerIndex === this.roleSelectorIndex;
  }

  // Ustawia fazę bez wywoływania hooków onEnter/onExit — używane wyłącznie przy deserializacji.
  restorePhase(phase: GamePhase): void {
    this.currentPhase = phase;
  }
}
