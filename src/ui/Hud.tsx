import { GameController } from '../game/controller';
import { BoardScene } from '../three/scene';

interface Props {
  controller: GameController;
  scene: BoardScene | null;
  onOpenSettings(): void;
  onOpenRules(): void;
  onExit(): void;
}

export default function Hud({ controller, scene, onOpenSettings, onOpenRules, onExit }: Props) {
  const st = controller.state;
  const s = controller.settings;
  const humanTurn = controller.isHumanTurn;
  const currentName = controller.playerName(st.currentPlayer);

  const remaining = controller.engine.remainingDice;
  const playedCount = controller.engine.played.length;
  const totalDice = st.dice ? (st.dice[0] === st.dice[1] ? 4 : 2) : 0;
  const usedDice = st.dice
    ? Array.from({ length: totalDice }, (_, i) => {
        const die = st.dice![0] === st.dice![1] ? st.dice![0] : i === 0 ? st.dice![0] : st.dice![1];
        return { die, used: i < playedCount || i >= playedCount + remaining.length };
      })
    : [];

  return (
    <>
      {/* верхняя панель */}
      <div className="hud hud-top">
        <div className="hud-block">
          <div className="hud-title">КОТОНАРДЫ</div>
          <div className="hud-mode">{st.mode === 'long' ? 'Длинные нарды' : 'Короткие нарды'}</div>
        </div>
        <div className="hud-block">
          <div className="hud-label">Ход</div>
          <div className={`hud-turn ${st.currentPlayer === 1 ? 'dark' : ''}`}>
            {st.phase === 'over' ? 'Партия окончена' : currentName}
            {controller.config.opponent === 'ai' && !humanTurn && st.phase !== 'over' && ' 🤖'}
          </div>
        </div>
        <div className="hud-block hud-dice-block">
          {st.dice ? (
            <>
              <div className="hud-dice">
                🎲 {st.dice[0]} · {st.dice[1]}
                {st.dice[0] === st.dice[1] && <span className="hud-double"> — ДУБЛЬ</span>}
              </div>
              <div className="hud-remaining">
                {usedDice.map((u, i) => (
                  <span key={i} className={u.used ? 'die-used' : 'die-left'}>
                    {u.die} {u.used ? '✓' : '○'}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="hud-dice hud-dice-idle">🎲 —</div>
          )}
        </div>
        <div className="hud-block">
          <div className="hud-label">Снято</div>
          <div className="hud-off">
            🐾 {st.off[0]} / 15&nbsp;&nbsp;·&nbsp;&nbsp;{st.off[1]} / 15 🐾
          </div>
        </div>
        <div className="hud-block">
          <div className="hud-label">Счёт</div>
          <div className="hud-score">
            {controller.score.wins[0]} : {controller.score.wins[1]}
            {controller.score.mars.some((m) => m > 0) && (
              <span className="hud-mars">&nbsp;(марс: {controller.score.mars[0]}:{controller.score.mars[1]})</span>
            )}
          </div>
        </div>
        <div className="hud-actions">
          <button className="hud-btn" title="Меню" onClick={onExit}>☰</button>
          <button className="hud-btn" title="Настройки" onClick={onOpenSettings}>⚙</button>
          <button className="hud-btn" title="Правила" onClick={onOpenRules}>?</button>
        </div>
      </div>

      {/* нижняя панель */}
      <div className="hud hud-bottom">
        <div className="hud-cam">
          <button className="hud-btn" title="Вид игрока" onClick={() => scene?.viewForPlayer(st.currentPlayer)}>👁 Вид игрока</button>
          <button className="hud-btn" title="Сверху" onClick={() => scene?.viewTop()}>⬇ Сверху</button>
          <button className="hud-btn" title="Развернуть доску на 180°" onClick={() => scene?.flipBoard()}>⟳ Развернуть</button>
        </div>
        <div className="hud-status">
          {st.phase === 'roll' && humanTurn && !controller.busy && 'Нажмите «Бросить кубики»'}
          {st.phase === 'roll' && !humanTurn && !controller.busy && `${currentName} думает о броске…`}
          {controller.busy && '…'}
          {!controller.busy && controller.statusMessage && st.phase !== 'over' ? controller.statusMessage : ''}
          {s.showHints && st.phase === 'move' && humanTurn && !controller.busy && controller.playerCanAct() && (
            <span className="hud-hint"> — кликните фишку или перетащите её</span>
          )}
        </div>
        <div className="hud-play">
          <button
            className="btn btn-gold"
            disabled={st.phase !== 'roll' || !humanTurn || controller.busy}
            onClick={() => void controller.roll()}
          >
            🎲 Бросить кубики
          </button>
          <button
            className="btn"
            disabled={!controller.isHumanTurn || st.phase !== 'move' || controller.engine.played.length === 0 || controller.busy}
            onClick={() => controller.undo()}
            title="Отменить последний ход"
          >
            ↩ Undo
          </button>
        </div>
      </div>
    </>
  );
}
