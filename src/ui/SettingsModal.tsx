import { GameController } from '../game/controller';
import type { Settings } from '../game/controller';

interface Props {
  controller: GameController;
  onClose(): void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">{label}</div>
      <div className="set-control">{children}</div>
    </div>
  );
}

export default function SettingsModal({ controller, onClose }: Props) {
  const s = controller.settings;
  const upd = (patch: Partial<Settings>) => controller.updateSettings(patch);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Настройки</h2>
        <Row label="Громкость">
          <input type="range" min={0} max={1} step={0.05} value={s.volume}
            onChange={(e) => upd({ volume: Number(e.target.value) })} />
        </Row>
        <Row label="Музыка">
          <button className={`switch ${s.music ? 'on' : ''}`} onClick={() => upd({ music: !s.music })}>{s.music ? 'вкл' : 'выкл'}</button>
        </Row>
        <Row label="Звуки">
          <button className={`switch ${s.sounds ? 'on' : ''}`} onClick={() => upd({ sounds: !s.sounds })}>{s.sounds ? 'вкл' : 'выкл'}</button>
        </Row>
        <Row label="Качество графики">
          <div className="seg">
            {(['low', 'medium', 'high'] as const).map((q) => (
              <button key={q} className={s.quality === q ? 'seg-on' : ''} onClick={() => upd({ quality: q })}>
                {q === 'low' ? 'низкое' : q === 'medium' ? 'среднее' : 'высокое'}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Тени">
          <button className={`switch ${s.shadows ? 'on' : ''}`} onClick={() => upd({ shadows: !s.shadows })}>{s.shadows ? 'вкл' : 'выкл'}</button>
        </Row>
        <Row label="Сглаживание">
          <button className={`switch ${s.antialias ? 'on' : ''}`} onClick={() => upd({ antialias: !s.antialias })}>{s.antialias ? 'вкл' : 'выкл'}</button>
        </Row>
        <Row label="Счёт (длинные)">
          <div className="seg">
            <button className={s.scoreProfile === 'official' ? 'seg-on' : ''} onClick={() => upd({ scoreProfile: 'official' })}>
              официальный РФ
            </button>
            <button className={s.scoreProfile === 'classic' ? 'seg-on' : ''} onClick={() => upd({ scoreProfile: 'classic' })}>
              классический
            </button>
          </div>
        </Row>
        <Row label="Скорость анимаций">
          <div className="seg">
            {([
              [0.5, 'медленно'], [1, 'нормально'], [2, 'быстро'], [10, 'мгновенно'],
            ] as const).map(([v, name]) => (
              <button key={name} className={s.animSpeed === v ? 'seg-on' : ''} onClick={() => upd({ animSpeed: v })}>{name}</button>
            ))}
          </div>
        </Row>
        <Row label="Чувствительность камеры">
          <input type="range" min={0.3} max={2.5} step={0.1} value={s.cameraSensitivity}
            onChange={(e) => upd({ cameraSensitivity: Number(e.target.value) })} />
        </Row>
        <Row label="Подсказки ходов">
          <button className={`switch ${s.showHints ? 'on' : ''}`} onClick={() => upd({ showHints: !s.showHints })}>{s.showHints ? 'вкл' : 'выкл'}</button>
        </Row>
        <Row label="Автоповорот к игроку">
          <button className={`switch ${s.autoRotate ? 'on' : ''}`} onClick={() => upd({ autoRotate: !s.autoRotate })}>{s.autoRotate ? 'вкл' : 'выкл'}</button>
        </Row>
        <Row label="Полный экран">
          <button
            className={`switch ${s.fullscreen ? 'on' : ''}`}
            onClick={() => {
              const next = !s.fullscreen;
              upd({ fullscreen: next });
              if (next) void document.documentElement.requestFullscreen?.();
              else void document.exitFullscreen?.();
            }}
          >
            {s.fullscreen ? 'вкл' : 'выкл'}
          </button>
        </Row>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
