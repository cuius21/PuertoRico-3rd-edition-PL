import { useState } from 'react';
import type { GameState } from '../../state/GameState';
import { RoleType } from '../../core/types';

interface Props {
  state: GameState;
}

export const ROLE_META: Record<
  RoleType,
  { label: string; color: string; icon: string }
> = {
  [RoleType.Settler]: { label: 'Plantator', color: '#4CAF50', icon: '🌱' },
  [RoleType.Mayor]: { label: 'Burmistrz', color: '#FFD700', icon: '👑' },
  [RoleType.Builder]: { label: 'Budowniczy', color: '#FF9800', icon: '🔨' },
  [RoleType.Craftsman]: { label: 'Zarządca', color: '#9C27B0', icon: '⚙️' },
  [RoleType.Trader]: { label: 'Kupiec', color: '#2196F3', icon: '💰' },
  [RoleType.Captain]: { label: 'Kapitan', color: '#F44336', icon: '⚓' },
  [RoleType.Prospector]: { label: 'Poszukiwacz', color: '#795548', icon: '⛏️' },
  [RoleType.Corsair]: { label: 'Korsarz', color: '#263238', icon: '🏴‍☠️' },
};

export const ROLE_DESCRIPTIONS: Record<
  RoleType,
  { privilege: string; action: string }
> = {
  [RoleType.Settler]: {
    privilege: 'Selektor może wziąć kamieniołom zamiast odkrytej plantacji.',
    action:
      'Każdy gracz bierze po jednej plantacji z odkrytej puli lub pasuje. (Posiadacz Kuźni też może wziąć kamieniołom.)',
  },
  [RoleType.Mayor]: {
    privilege: 'Selektor dostaje +1 dodatkowego robotnika z puli globalnej.',
    action:
      'Robotnicy z Magistratu są rozdzielani po jednym, zaczynając od wybierającego rolę. Każdy gracz rozmieszcza swoją załogę; niewykorzystani pracownicy pozostają w jego rezerwie.',
  },
  [RoleType.Builder]: {
    privilege:
      'Selektor buduje o 1 dublon taniej (łącznie ze zniżką z kamieniołomów).',
    action:
      'Każdy gracz może zbudować jeden budynek, płacąc do banku. Kamieniołomy dają zniżkę wg grupy cenowej budynku.',
  },
  [RoleType.Craftsman]: {
    privilege:
      'Selektor wybiera 1 dodatkowy towar (spośród wyprodukowanych w tej turze).',
    action:
      'Wszyscy gracze produkują towary. Ilość ogranicza liczba obsadzonych plantacji, obsadzonych miejsc w odpowiednich zakładach oraz dostępny zapas towaru. Kukurydza nie wymaga zakładu; indygo wymaga farbiarni.',
  },
  [RoleType.Trader]: {
    privilege: 'Selektor dostaje +1 dublon za sprzedaż na targowisku.',
    action:
      'Każdy gracz może sprzedać jeden towar na targowisku (4 sloty). Nie można sprzedać towaru który już tam leży (chyba że gracz ma Biuro Handlowe).',
  },
  [RoleType.Captain]: {
    privilege: 'Wybierający rolę dostaje +1 punkt zwycięstwa (★) za swój pierwszy załadunek w tej fazie.',
    action:
      'Gracze kolejno ładują towary: zwykle 1 punkt zwycięstwa (★) za każdą sztukę. Musisz ładować, jeśli możesz. Kolejka powtarza się, dopóki ktoś może ładować. Po fazie bez magazynu zachowujesz tylko 1 sztukę niewysłanego towaru, nie cały rodzaj. Pełne statki są opróżniane po całej fazie.',
  },
  [RoleType.Prospector]: {
    privilege: 'Selektor dostaje 1 dublon z banku.',
    action:
      'Pozostali gracze nie dostają nic. (Postać dostępna tylko przy 4–5 graczach.)',
  },
  [RoleType.Corsair]: {
    privilege:
      'Selektor zdobywa żeton korsarza i wykonuje jedną akcję: Piractwo (towary ze statku), Grabież (towary z targowiska → PZ), Najazd (robotnicy z magistratu), Pojmanie (przechwytuje kartę postaci — inne osoby mogą ją wykupić za 3 dublony).',
    action:
      'Tylko selektor wykonuje akcję. Posiadacz żetonu korsarza nie może ponownie wybrać tej postaci dopóki ktoś inny jej nie weźmie.',
  },
};

export function RoleCardsBar({ state }: Props) {
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);

  const toggle = (role: RoleType) =>
    setSelectedRole((prev) => (prev === role ? null : role));

  const desc = selectedRole ? ROLE_DESCRIPTIONS[selectedRole] : null;
  const meta = selectedRole ? ROLE_META[selectedRole] : null;

  return (
    <div className="role-cards-wrapper">
      <div className="role-cards-bar">
        {state.roleCards.map((card, cardIndex) => {
          const m = ROLE_META[card.type];
          const taken = !card.isAvailable();
          const takenPlayer = taken
            ? state.players.find((p) => p.id === card.takenBy)
            : null;
          const isCaptured = state.capturedRoleCard === card.type;
          const isInfoOpen = selectedRole === card.type;

          return (
            <div
              key={card.type + cardIndex}
              className={`role-card ${taken ? 'role-card--taken' : 'role-card--available'} ${isCaptured ? 'role-card--captured' : ''} ${isInfoOpen ? 'role-card--info-open' : ''}`}
              style={{ '--role-color': m.color } as React.CSSProperties}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(card.type);
                }
              }}
              onClick={() => toggle(card.type)}
              title={
                isCaptured
                  ? 'Pojmana przez Korsarza — wykup za 3 dublony'
                  : 'Kliknij, aby zobaczyć opis'
              }
            >
              <span className="role-card__icon">{m.icon}</span>
              <span className="role-card__label">{m.label}</span>
              {isCaptured && <span className="role-card__captured">🏴‍☠️</span>}
              {card.doubloonsOnCard > 0 && (
                <span className="role-card__doubloons">
                  {card.doubloonsOnCard}
                  <span className="icon-coin">D</span>
                </span>
              )}
              {taken && takenPlayer && (
                <span className="role-card__owner">{takenPlayer.name}</span>
              )}
            </div>
          );
        })}
      </div>

      {selectedRole && meta && desc && (
        <div className="role-desc-panel" style={{ borderColor: meta.color }}>
          <div className="role-desc-panel__header">
            <span>
              {meta.icon} <strong>{meta.label}</strong>
            </span>
            <button
              className="role-desc-panel__close"
              onClick={() => setSelectedRole(null)}
            >
              ✕
            </button>
          </div>
          <div className="role-desc-panel__body">
            <div className="role-desc-row">
              <span className="role-desc-label">ℹ Przywilej:</span>
              <span className="role-desc-text">{desc.privilege}</span>
            </div>
            <div className="role-desc-row">
              <span className="role-desc-label">▶ Akcja:</span>
              <span className="role-desc-text">{desc.action}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
