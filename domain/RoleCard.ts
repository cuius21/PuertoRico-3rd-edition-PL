import { RoleType, type PlayerId } from '../core/types';

// Karta postaci. Leży na planszy ogólnej. Co rundę może otrzymać dodatkowe dublony
// (gubernator dokłada po jednym na każdej niewykorzystanej karcie).
//
// Gdy gracz wybiera postać, zabiera ewentualne dublony z karty
// i ta karta zostaje "przy nim" do końca rundy (takenBy ustawione).
// Pojedyncze źródło prawdy: które postacie są zajęte = które RoleCard mają takenBy != null.
export class RoleCard {
  doubloonsOnCard: number = 0;
  takenBy: PlayerId | null = null;

  constructor(readonly type: RoleType) {}

  isAvailable(): boolean {
    return this.takenBy === null;
  }

  // Reset na koniec rundy - karta wraca do puli "wolna do wyboru".
  // (Dublonów już nie ma - gracz zabrał je przy wyborze. Dokładanie nowych
  // na karty niewybrane robi RoundEndPhase, nie ta metoda.)
  reset(): void {
    this.takenBy = null;
  }
}
