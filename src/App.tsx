import { useCallback, useState } from 'react';
import './App.css';
import MainMenu from './ui/MainMenu';
import GameScreen from './ui/GameScreen';
import { GameController } from './game/controller';
import type { GameConfig } from './game/controller';

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [controller, setController] = useState<GameController | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const startGame = useCallback((config: GameConfig, fromSave = false) => {
    if (fromSave) {
      const c = GameController.fromSave(null);
      if (c) {
        setController(c);
        setGameKey((k) => k + 1);
        setScreen('game');
        return;
      }
    }
    const c = new GameController(config);
    c.clearSave();
    c.saveNow();
    setController(c);
    setGameKey((k) => k + 1);
    setScreen('game');
  }, []);

  const exitToMenu = useCallback(() => {
    setController((c) => {
      c?.saveNow();
      return null;
    });
    setScreen('menu');
  }, []);

  if (screen === 'menu' || !controller) {
    return <MainMenu onStart={startGame} />;
  }
  return <GameScreen key={gameKey} controller={controller} onExit={exitToMenu} />;
}
