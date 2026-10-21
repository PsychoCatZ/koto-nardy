import { useState } from 'react';
import { GameController } from '../game/controller';
import type { GameConfig } from '../game/controller';
import type { GameMode } from '../game/types';
import RulesModal from './RulesModal';
import { sound } from '../audio/sound';

interface Props {
  onStart: (config: GameConfig, fromSave?: boolean) => void;
}

export default function MainMenu({ onStart }: Props) {
  const [mode, setMode] = useState<GameMode>('long');
  const [opponent, setOpponent] = useState<'ai' | 'local'>('ai');
  const [level, setLevel] = useState<'kitten' | 'cat' | 'madcat'>('cat');
  const [showRules, setShowRules] = useState(false);
  const hasSave = GameController.hasSave();

  const start = (fromSave = false) => {
    sound.unlock();
    onStart({ mode, opponent, aiLevel: level, humanPlayer: 0 }, fromSave);
  };

  return (
    <div className="menu-screen">
      <div className="menu-bg-paws" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`bg-paw bg-paw-${i % 4}`} style={{ left: `${5 + i * 7}%`, top: `${12 + (i % 5) * 18}%` }} />
        ))}
      </div>
      <div className="menu-panel">
        <div className="menu-cat" aria-hidden>🐈‍⬛</div>
        <h1 className="menu-title">КОТОНАРДЫ</h1>
        <p className="menu-sub">3D-нарды КотоИмперии</p>

        <div className="menu-section">
          <div className="menu-label">Тип игры</div>
          <div className="seg">
            <button className={mode === 'long' ? 'seg-on' : ''} onClick={() => setMode('long')}>Длинные нарды</button>
            <button className={mode === 'short' ? 'seg-on' : ''} onClick={() => setMode('short')}>Короткие нарды</button>
          </div>
        </div>

        <div className="menu-section">
          <div className="menu-label">Соперник</div>
          <div className="seg">
            <button className={opponent === 'ai' ? 'seg-on' : ''} onClick={() => setOpponent('ai')}>Против компьютера</button>
            <button className={opponent === 'local' ? 'seg-on' : ''} onClick={() => setOpponent('local')}>Два игрока</button>
          </div>
        </div>

        {opponent === 'ai' && (
          <div className="menu-section">
            <div className="menu-label">Сложность компьютера</div>
            <div className="seg">
              <button className={level === 'kitten' ? 'seg-on' : ''} onClick={() => setLevel('kitten')}>🐱 Котёнок</button>
              <button className={level === 'cat' ? 'seg-on' : ''} onClick={() => setLevel('cat')}>🐈 Кот</button>
              <button className={level === 'madcat' ? 'seg-on' : ''} onClick={() => setLevel('madcat')}>🙀 Безумный Котяра</button>
            </div>
          </div>
        )}

        <div className="menu-buttons">
          <button className="btn btn-primary" onClick={() => start()}>Новая партия</button>
          {hasSave && (
            <button className="btn btn-gold" onClick={() => start(true)}>Продолжить</button>
          )}
          <button className="btn" onClick={() => setShowRules(true)}>Правила</button>
        </div>
        <p className="menu-foot">элегантные серьёзные нарды, полностью захваченные котами</p>
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
