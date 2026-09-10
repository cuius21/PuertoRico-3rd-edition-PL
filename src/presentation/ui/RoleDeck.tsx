import { useState, type CSSProperties } from 'react';
import type { Action } from '../../../actions/Action';
import type { GameState } from '../../../state/GameState';
import { RoleType } from '../../../core/types';
import { ROLE_META, ROLE_DESCRIPTIONS } from '../../components/RoleCardsBar';
import { spriteStyle, idleSpriteStyle } from '../assets/registry';
import { actionKey } from '../interaction/actionBridge';
import { roleChoice } from '../interaction/roleChoices';
import { WorldDialog } from './WorldDialog';

const ART: Record<RoleType, string> = {
  [RoleType.Settler]: 'corn',
  [RoleType.Mayor]: 'magistrate',
  [RoleType.Builder]: 'smithy',
  [RoleType.Craftsman]: 'coffeeRoaster',
  [RoleType.Trader]: 'market',
  [RoleType.Captain]: 'ship',
  [RoleType.Prospector]: 'quarry',
  [RoleType.Corsair]: 'corsair',
};
export function RoleDeck({
  state,
  actions,
  waiting,
  onChoose,
}: {
  state: GameState;
  actions: Action[];
  waiting: boolean;
  onChoose: (key: string) => void;
}) {
  const [info, setInfo] = useState<RoleType | null>(null);
  const current = state.getCurrentPlayer();
  return (
    <>
      <div className="pr-deck" aria-label="Karty postaci">
        {state.roleCards.map((card, index) => {
          const meta = ROLE_META[card.type],
            choice = roleChoice(state, actions, index);
          const active =
            String(state.getCurrentPhase().type) === card.type &&
            card.takenBy === state.players[state.roleSelectorIndex]?.id;
          const owner = state.players.find((p) => p.id === card.takenBy);
          const captured = state.capturedRoleCard === card.type;
          return (
            <div
              key={index}
              className={
                'pr-role' +
                (active ? ' is-active' : '') +
                (!card.isAvailable() ? ' is-taken' : '') +
                (choice && !waiting ? ' is-playable' : '')
              }
              style={{ '--role-color': meta.color } as CSSProperties}
            >
              <button
                className="pr-role-pick"
                aria-pressed={active}
                aria-label={
                  (choice && !waiting ? 'Wybierz: ' : 'Opis: ') +
                  meta.label +
                  ' · karta ' +
                  (index + 1)
                }
                onClick={() =>
                  choice && !waiting
                    ? onChoose(actionKey(choice))
                    : setInfo(card.type)
                }
              >
                <span
                  className="pr-role-art"
                  style={spriteStyle(ART[card.type])}
                  aria-hidden="true"
                />
                <span className="pr-role-name">
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                </span>
                <span className="pr-role-status">
                  {active
                    ? 'AKTYWNA POSTAĆ'
                    : owner
                      ? owner.name
                      : captured
                        ? 'Wykup za 3 D'
                        : choice && !waiting
                          ? 'Wybierz postać'
                          : 'Dostępna'}
                </span>
                {active && card.type === RoleType.Mayor && (
                  <span
                    className="pr-role-workforce"
                    role="status"
                    aria-label={
                      current.name +
                      ': do przydzielenia ' +
                      current.pendingWorkers +
                      ' robotników i ' +
                      current.pendingNobles +
                      ' szlachciców'
                    }
                  >
                    <span>
                      <i style={idleSpriteStyle('worker')} aria-hidden="true" />{' '}
                      <b>{current.pendingWorkers}</b>
                      {state.nobleExpansion && (
                        <>
                          <i
                            style={idleSpriteStyle('noble')}
                            aria-hidden="true"
                          />{' '}
                          <b>{current.pendingNobles}</b>
                        </>
                      )}
                    </span>
                    <small>Do przydziału · {current.name}</small>
                  </span>
                )}
                {card.doubloonsOnCard > 0 && (
                  <span className="pr-role-coins">
                    +{card.doubloonsOnCard} D
                  </span>
                )}
              </button>
              <button
                className="pr-role-help"
                aria-label={
                  'Opis postaci: ' + meta.label + ' · karta ' + (index + 1)
                }
                onClick={() => setInfo(card.type)}
              >
                ?
              </button>
            </div>
          );
        })}
      </div>
      {info && (
        <WorldDialog
          title={ROLE_META[info].label}
          eyebrow="KARTA POSTACI"
          onClose={() => setInfo(null)}
        >
          <div className="pr-role-description">
            <span
              className="pr-art pr-art--large"
              style={spriteStyle(ART[info])}
              aria-hidden="true"
            />
            <div>
              <h3>Akcja</h3>
              <p className="pr-intro">{ROLE_DESCRIPTIONS[info].action}</p>
              <h3>Przywilej wybierającego</h3>
              <p className="pr-intro">{ROLE_DESCRIPTIONS[info].privilege}</p>
            </div>
          </div>
        </WorldDialog>
      )}
    </>
  );
}
