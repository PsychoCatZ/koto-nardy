import { GameController } from '../game/controller';

interface Props {
  controller: GameController;
  onRematch(): void;
  onNewGame(): void;
  onMenu(): void;
}

export default function VictoryOverlay({ controller, onRematch, onNewGame, onMenu }: Props) {
  const st = controller.state;
  const winner = st.winner!;
  const name = controller.playerName(winner);

  return (
    <div className="modal-backdrop victory-backdrop">
      <div className="modal victory-modal">
        <div className="victory-paws">🐾 🐾 🐾</div>
        <h1 className="victory-title">{name.toUpperCase()} ПОБЕДИЛ{winner === 1 ? '' : 'И'}</h1>
        {st.outcome !== 'oin' && (
          <div className="victory-mars">
            <div className="mars-title">
              {st.outcome === 'mars' ? 'МАРС!' : st.outcome === 'koks' ? 'КОКС!' : 'ДОМАШНИЙ МАРС!'}
            </div>
            <div>
              {st.outcome === 'mars' && 'КотоИмперия не оставила сопернику ни одной снятой лапы.'}
              {st.outcome === 'koks' && 'У соперника лапка так и не покинула базу. +3 очка.'}
              {st.outcome === 'home' && 'Все 15 лап соперника уже дома, но ни одна не снята. +4 очка — позор!'}
            </div>
          </div>
        )}
        <div className="victory-score">
          Счёт серии: {controller.score.wins[0]} : {controller.score.wins[1]}
        </div>
        <div className="modal-actions modal-actions-col">
          <button className="btn btn-gold btn-big" onClick={onRematch}>Реванш</button>
          <button className="btn btn-primary" onClick={onNewGame}>Новая партия</button>
          <button className="btn" onClick={onMenu}>Главное меню</button>
        </div>
      </div>
    </div>
  );
}
