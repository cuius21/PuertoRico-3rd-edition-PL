import type { ReactNode } from 'react';
import type { FestivalBoard, FestivalQuest } from '../../domain/FestivalBoard';
import { PLANTATION_LABELS } from '../../domain/FestivalBoard';
import type { Player } from '../../domain/Player';
import { GoodType } from '../../core/types';

const GOOD_ICON_NODES: Record<GoodType, ReactNode> = {
  [GoodType.Corn]:    '🌽',
  [GoodType.Indigo]:  '🔵',
  [GoodType.Sugar]:   <span className="icon-sugar" />,
  [GoodType.Tobacco]: '🍂',
  [GoodType.Coffee]:  '☕',
};

interface Props {
  board: FestivalBoard;
  players: Player[];
}

function playerName(playerId: string | null, players: Player[]): string {
  if (!playerId) return '';
  return players.find(p => p.id === playerId)?.name ?? playerId;
}

function QuestRow({ quest, players }: { quest: FestivalQuest; players: Player[] }) {
  const done = !!quest.completedBy;

  let title = '';
  let detail: ReactNode = '';
  let reward = '';

  if (quest.type === 'uprawa') {
    title = 'Uprawa';
    detail = `3× ${PLANTATION_LABELS[quest.plantationType]}`;
    reward = '+3 robotnicy';
  } else if (quest.type === 'produkcja') {
    const goods = (Object.entries(quest.requiredGoods) as [GoodType, number][]);
    detail = (
      <>
        {goods.map(([g, n], i) => (
          <span key={g} style={{ marginRight: i < goods.length - 1 ? 4 : 0 }}>
            {n > 1 ? `${n}×` : ''}{GOOD_ICON_NODES[g]}
          </span>
        ))}
      </>
    );
    title = 'Produkcja';
    reward = '+3 duble';
  } else {
    title = 'Budowa';
    detail = quest.buildingDisplayName;
    reward = '+3 PZ';
  }

  return (
    <div className={`festival-quest ${done ? 'festival-quest--done' : ''}`}>
      <div className="festival-quest__header">
        <span className="festival-quest__type">{title}</span>
        <span className="festival-quest__reward">{reward}</span>
      </div>
      <div className="festival-quest__detail">{detail}</div>
      {done && (
        <div className="festival-quest__winner">✓ {playerName(quest.completedBy, players)}</div>
      )}
    </div>
  );
}

export function FestivalBoardPanel({ board, players }: Props) {
  return (
    <div className="festival-board-panel">
      <div className="festival-board-title">🎪 Festyn w San Juan</div>
      <div className="festival-board-quests">
        <QuestRow quest={board.uprawa}    players={players} />
        <QuestRow quest={board.produkcja} players={players} />
        <QuestRow quest={board.budowa}    players={players} />
      </div>
    </div>
  );
}
