import { useState } from 'react';
import type { GameState } from '../../state/GameState';
import { RoleType } from '../../core/types';

interface Props {
  state: GameState;
}

const ROLE_META: Record<RoleType, { label: string; color: string; icon: string }> = {
  [RoleType.Settler]:    { label: 'Plantator',   color: '#4CAF50', icon: '🌱' },
  [RoleType.Mayor]:      { label: 'Burmistrz',   color: '#FFD700', icon: '👑' },
  [RoleType.Builder]:    { label: 'Budowniczy',  color: '#FF9800', icon: '🔨' },
  [RoleType.Craftsman]:  { label: 'Zarządca',    color: '#9C27B0', icon: '⚙️' },
  [RoleType.Trader]:     { label: 'Kupiec',      color: '#2196F3', icon: '💰' },
  [RoleType.Captain]:    { label: 'Kapitan',     color: '#F44336', icon: '⚓' },
  [RoleType.Prospector]: { label: 'Poszukiwacz', color: '#795548', icon: '⛏️' },
};

const ROLE_DESCRIPTIONS: Record<RoleType, { privilege: string; action: string }> = {
  [RoleType.Settler]: {
    privilege: 'Selektor może wziąć kamieniołom zamiast odkrytej plantacji.',
    action: 'Każdy gracz bierze po jednej plantacji z odkrytej puli lub pasuje. (Posiadacz Kuźni też może wziąć kamieniołom.)',
  },
  [RoleType.Mayor]: {
    privilege: 'Selektor dostaje +1 dodatkowego robotnika z puli globalnej.',
    action: 'Robotnicy z Magistratu rozdzielani po jednym, zaczynając od selektora. Każdy gracz rozmieszcza robotników lub oddaje pozostałych do puli.',
  },
  [RoleType.Builder]: {
    privilege: 'Selektor buduje o 1 dublon taniej (łącznie z zniżką z kamieniołomów).',
    action: 'Każdy gracz może zbudować jeden budynek, płacąc do banku. Kamieniołomy dają zniżkę wg grupy cenowej budynku.',
  },
  [RoleType.Craftsman]: {
    privilege: 'Selektor wybiera 1 dodatkowy towar (spośród wyprodukowanych w tej turze).',
    action: 'Wszyscy gracze jednocześnie produkują towary: aktywne budynki produkcyjne × aktywne plantacje danego surowca.',
  },
  [RoleType.Trader]: {
    privilege: 'Selektor dostaje +1 dublon za sprzedaż na targowisku.',
    action: 'Każdy gracz może sprzedać jeden towar na targowisku (4 sloty). Nie można sprzedać towaru który już tam leży (chyba że gracz ma Biuro Handlowe).',
  },
  [RoleType.Captain]: {
    privilege: 'Selektor dostaje +1 PZ za swój pierwszy załadunek w tej fazie.',
    action: 'Gracze kolejno ładują towary na statki i zdobywają PZ (1 PZ / ładunek). Gracz MUSI załadować jeśli może. Po fazie każdy może zachować max 1 rodzaj towaru.',
  },
  [RoleType.Prospector]: {
    privilege: 'Selektor dostaje 1 dublon z banku.',
    action: 'Pozostali gracze nie dostają nic. (Postać dostępna tylko przy 4–5 graczach.)',
  },
};

export function RoleCardsBar({ state }: Props) {
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);

  const toggle = (role: RoleType) =>
    setSelectedRole(prev => (prev === role ? null : role));

  const desc = selectedRole ? ROLE_DESCRIPTIONS[selectedRole] : null;
  const meta = selectedRole ? ROLE_META[selectedRole] : null;

  return (
    <div className="role-cards-wrapper">
      <div className="role-cards-bar">
        {state.roleCards.map(card => {
          const m = ROLE_META[card.type];
          const taken = !card.isAvailable();
          const takenPlayer = taken
            ? state.players.find(p => p.id === card.takenBy)
            : null;
          const isInfoOpen = selectedRole === card.type;

          return (
            <div
              key={card.type}
              className={`role-card ${taken ? 'role-card--taken' : 'role-card--available'} ${isInfoOpen ? 'role-card--info-open' : ''}`}
              style={{ '--role-color': m.color } as React.CSSProperties}
              onClick={() => toggle(card.type)}
              title="Kliknij, aby zobaczyć opis"
            >
              <span className="role-card__icon">{m.icon}</span>
              <span className="role-card__label">{m.label}</span>
              {card.doubloonsOnCard > 0 && (
                <span className="role-card__doubloons">{card.doubloonsOnCard}🪙</span>
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
            <span>{meta.icon} <strong>{meta.label}</strong></span>
            <button className="role-desc-panel__close" onClick={() => setSelectedRole(null)}>✕</button>
          </div>
          <div className="role-desc-panel__body">
            <div className="role-desc-row">
              <span className="role-desc-label">★ Przywilej:</span>
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
