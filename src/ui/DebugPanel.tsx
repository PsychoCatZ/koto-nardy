import { useState } from 'react';
import { GameController } from '../game/controller';

interface Props {
  controller: GameController;
  onClose(): void;
}

export default function DebugPanel({ controller, onClose }: Props) {
  const [d1, setD1] = useState(3);
  const [d2, setD2] = useState(4);
  const st = controller.state;
  const [, force] = useState(0);

  const seqs = controller.engine.sequences;
  const prefix = controller.engine.played.map((p) => `${p.move.from}>${p.move.to}(${p.move.die})`).join(' ');

  return (
    <div className="debug-panel">
      <div className="debug-head">
        <b>DEBUG</b>
        <button className="hud-btn" onClick={onClose}>×</button>
      </div>
      <div className="debug-row"><span>Game mode</span><b>{st.mode}</b></div>
      <div className="debug-row"><span>Current player</span><b>{st.currentPlayer} ({controller.playerName(st.currentPlayer)})</b></div>
      <div className="debug-row"><span>Dice</span><b>{st.dice ? `${st.dice[0]} : ${st.dice[1]}` : '—'}</b></div>
      <div className="debug-row"><span>Remaining dice</span><b>{controller.engine.remainingDice.join(', ') || '—'}</b></div>
      <div className="debug-row"><span>Turn number</span><b>{st.turnNumber}</b></div>
      <div className="debug-row"><span>Phase</span><b>{st.phase}</b></div>
      <div className="debug-row"><span>Selected prefix</span><b>{prefix || '—'}</b></div>
      <div className="debug-seq">
        <div>Legal move sequences: {seqs.length}</div>
        <pre>{seqs.slice(0, 12).map((s) => s.moves.map((m) => `${m.from}>${m.to}:${m.die}`).join('  ')).join('\n')}</pre>
      </div>
      <div className="debug-cmd">
        <div className="debug-cmd-row">
          <input type="number" min={1} max={6} value={d1} onChange={(e) => setD1(Number(e.target.value))} />
          <input type="number" min={1} max={6} value={d2} onChange={(e) => setD2(Number(e.target.value))} />
          <button className="hud-btn" disabled={st.phase !== 'roll'} onClick={() => controller.debugSetDice(d1, d2)}>Set dice</button>
        </div>
        <div className="debug-cmd-row">
          <button className="hud-btn" onClick={() => { controller.debugLoadPosition(st.mode, st.mode === 'long' ? 'start' : 'blot'); force((x) => x + 1); }}>
            Тест: старт
          </button>
          <button className="hud-btn" onClick={() => { controller.debugLoadPosition(st.mode, 'block'); force((x) => x + 1); }} disabled={st.mode !== 'long'}>
            Тест: блок
          </button>
          <button className="hud-btn" onClick={() => { controller.debugLoadPosition(st.mode, 'bearing'); force((x) => x + 1); }}>
            Тест: вынос
          </button>
          <button className="hud-btn" onClick={() => { controller.debugLoadPosition('short', 'bar'); force((x) => x + 1); }} disabled={st.mode !== 'short'}>
            Тест: бар
          </button>
        </div>
        <div className="debug-cmd-row">
          <button className="hud-btn" onClick={() => { controller.debugSwitchPlayer(); force((x) => x + 1); }}>
            Переключить игрока
          </button>
          <button className="hud-btn" onClick={() => { controller.debugToBearingOff(); force((x) => x + 1); }}>
            К выбрасыванию
          </button>
        </div>
      </div>
    </div>
  );
}
