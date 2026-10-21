import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GameController } from '../game/controller';
import { BoardScene } from '../three/scene';
import { sound } from '../audio/sound';
import Hud from './Hud';
import SettingsModal from './SettingsModal';
import RulesModal from './RulesModal';
import VictoryOverlay from './VictoryOverlay';
import DebugPanel from './DebugPanel';

interface Props {
  controller: GameController;
  onExit: () => void;
}

export default function GameScreen({ controller, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.state.turnNumber + controller.state.phase + (controller.state.dice?.join(',') ?? '') + controller.busy + controller.statusMessage + controller.state.off.join(','),
  );

  useEffect(() => {
    const container = containerRef.current!;
    const scene = new BoardScene(container);
    sceneRef.current = scene;
    (window as unknown as { __scene?: BoardScene }).__scene = scene;
    (window as unknown as { __controller?: GameController }).__controller = controller;
    controller.attachScene(scene);
    sound.setSettings({
      volume: controller.settings.volume,
      soundsOn: controller.settings.sounds,
      musicOn: controller.settings.music,
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') setShowDebug((v) => !v);
      if (e.key === 'Escape') setShowSettings((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      controller.saveNow();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [controller]);

  // автоматический ход ИИ после загрузки сохранённой партии
  useEffect(() => {
    if (controller.state.phase === 'roll' && !controller.isHumanTurn) {
      const t = setTimeout(() => void controller.roll(), 800);
      return () => clearTimeout(t);
    }
  }, [controller]);

  return (
    <div className="game-screen">
      <div ref={containerRef} className="canvas-host" />

      <Hud
        controller={controller}
        onOpenSettings={() => setShowSettings(true)}
        onOpenRules={() => setShowRules(true)}
        onExit={onExit}
        scene={sceneRef.current}
      />

      {controller.state.phase === 'over' && (
        <VictoryOverlay
          controller={controller}
          onRematch={() => controller.rematch()}
          onNewGame={onExit}
          onMenu={onExit}
        />
      )}

      {showSettings && (
        <SettingsModal controller={controller} onClose={() => setShowSettings(false)} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showDebug && <DebugPanel controller={controller} onClose={() => setShowDebug(false)} />}
    </div>
  );
}
