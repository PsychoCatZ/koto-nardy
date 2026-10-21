import { GameEngine, generateSequences } from './engine';
import { chooseSequence } from './ai';
import type { AiLevel } from './ai';
import { cloneState } from './types';
import type { GameMode, GameState, Move, PlayerId, TurnSequence } from './types';
import { BoardScene } from '../three/scene';
import { sound } from '../audio/sound';

export type OpponentType = 'ai' | 'local';

export interface GameConfig {
  mode: GameMode;
  opponent: OpponentType;
  aiLevel: AiLevel;
  /** в режиме против компьютера человек всегда игрок 0 */
  humanPlayer: PlayerId;
}

export interface Settings {
  volume: number;
  music: boolean;
  sounds: boolean;
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  antialias: boolean;
  animSpeed: number; // 0.5 медленно … 4 мгновенно (10)
  showHints: boolean;
  autoRotate: boolean;
  fullscreen: boolean;
  cameraSensitivity: number;
  /** профиль счёта длинных нард: официальный (оин/марс) или классический (+кокс/домашний) */
  scoreProfile: 'official' | 'classic';
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  music: false,
  sounds: true,
  quality: 'high',
  shadows: true,
  antialias: true,
  animSpeed: 1,
  showHints: true,
  autoRotate: true,
  fullscreen: false,
  cameraSensitivity: 1,
  scoreProfile: 'official',
};

// v2: сменилась геометрия длинных нард (голова белых п.23, чёрных п.11) —
// сохранения v1 несовместимы и игнорируются
const SAVE_KEY = 'kotopardy-save-v2';
const SETTINGS_KEY = 'kotopardy-settings-v1';
const SCORE_KEY = 'kotopardy-score-v1';

export interface ScoreBoard {
  wins: [number, number];
  mars: [number, number];
}

type Listener = () => void;

export class GameController {
  engine: GameEngine;
  config: GameConfig;
  scene: BoardScene | null = null;
  settings: Settings = { ...DEFAULT_SETTINGS };
  score: ScoreBoard = { wins: [0, 0], mars: [0, 0] };

  /** очередь ходов ИИ в текущем ходу */
  private aiPlan: Move[] = [];
  busy = false;
  selected: number | 'bar' | null = null;
  statusMessage = '';

  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  constructor(config: GameConfig) {
    this.config = config;
    this.loadSettings();
    this.loadScore();
    this.engine = new GameEngine(config.mode, Math.random() < 0.5 ? 0 : 1, this.longVariant());
  }

  /** Профиль счёта длинных нард для движка */
  private longVariant() {
    return this.settings.scoreProfile === 'classic'
      ? { scoring: 'classic-online' as const, enableKoks: true, enableHomeMars: true }
      : { scoring: 'official-rf-2025' as const };
  }

  // ---------- подписка ----------
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.listeners.forEach((f) => f());
  }

  get state(): GameState {
    return this.engine.state;
  }

  get isHumanTurn(): boolean {
    return this.config.opponent === 'local' || this.state.currentPlayer === this.config.humanPlayer;
  }

  // ---------- настройки/счёт ----------
  loadSettings(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
  }
  saveSettings(): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }
  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.saveSettings();
    sound.setSettings({ volume: this.settings.volume, soundsOn: this.settings.sounds, musicOn: this.settings.music });
    if (patch.scoreProfile !== undefined) {
      this.engine.setLongVariant(this.longVariant());
    }
    if (this.scene) {
      this.scene.setQuality(this.settings.quality);
      this.scene.setShadows(this.settings.shadows);
      this.scene.setCameraSensitivity(this.settings.cameraSensitivity);
    }
    this.emit();
  }

  private loadScore(): void {
    try {
      const raw = localStorage.getItem(SCORE_KEY);
      if (raw) this.score = JSON.parse(raw);
    } catch { /* ignore */ }
  }
  private saveScore(): void {
    localStorage.setItem(SCORE_KEY, JSON.stringify(this.score));
  }

  // ---------- партия ----------
  attachScene(scene: BoardScene): void {
    this.scene = scene;
    scene.callbacks.onBoardClick = (c) => this.handleBoardClick(c);
    scene.callbacks.onDragMove = (from, to) => this.handleDragMove(from, to);
    scene.setQuality(this.settings.quality);
    scene.setShadows(this.settings.shadows);
    scene.setCameraSensitivity(this.settings.cameraSensitivity);
    scene.syncState(this.state, false);
    scene.setHighlights([], [], null);
    this.statusMessage = `Первым ходит: ${this.playerName(this.state.currentPlayer)}`;
    this.emit();
  }

  playerName(p: PlayerId): string {
    return p === 0 ? 'Светлые лапки' : 'Чёрный кот';
  }

  private newTurnUI(): void {
    this.selected = null;
    this.updateHighlights();
    // вращаем доску к текущему игроку только в режиме «два игрока» —
    // против AI доска всегда остаётся со стороны человека
    if (this.scene && this.settings.autoRotate && this.config.opponent === 'local') {
      this.scene.rotateToPlayer(this.state.currentPlayer);
    }
  }

  private updateHighlights(): void {
    if (!this.scene) return;
    if (this.state.phase !== 'move' || !this.isHumanTurn || this.busy) {
      this.scene.setHighlights([], [], null);
      return;
    }
    if (this.selected !== null) {
      const targets = this.engine.legalMovesFrom(this.selected).map((m) => m.to);
      this.scene.setHighlights([], targets, this.selected);
    } else {
      this.scene.setHighlights(this.engine.legalSources(), [], null);
    }
  }

  /** Бросок кубиков (кнопка или ИИ) */
  async roll(d1?: number, d2?: number): Promise<void> {
    if (this.busy || this.state.phase !== 'roll') return;
    this.busy = true;
    this.emit();
    const roll = this.engine.rollDice(d1, d2);
    if (this.scene) {
      await this.scene.rollDiceVisual(roll.dice[0], roll.dice[1], this.settings.animSpeed);
    }
    sound.play('dice');
    if (!this.engine.canMove()) {
      this.statusMessage = `${this.playerName(this.state.currentPlayer)}: ходов нет — пропуск`;
      this.emit();
      await this.delay(900 / this.settings.animSpeed);
      this.finishTurn();
      return;
    }
    this.statusMessage = `${this.playerName(this.state.currentPlayer)}, ваш ход`;
    this.busy = false;
    this.newTurnUI();
    this.emit();
    this.scheduleSave();
    if (!this.isHumanTurn) void this.aiTurn();
  }

  private async aiTurn(): Promise<void> {
    if (this.state.phase !== 'move' || this.isHumanTurn) return;
    this.busy = true;
    this.emit();
    await this.delay(450 / this.settings.animSpeed);
    const seq: TurnSequence = chooseSequence(this.state, this.engine.rules, this.engine.sequences, this.config.aiLevel);
    this.aiPlan = seq.moves.slice();
    while (this.aiPlan.length > 0) {
      if (this.state.phase !== 'move') break;
      const mv = this.aiPlan.shift()!;
      const before = cloneState(this.state);
      if (!this.engine.playMove(mv)) break;
      sound.play(mv.hit ? 'hit' : 'place');
      if (this.scene) await this.scene.animateMove(mv, before, this.state, this.settings.animSpeed);
      this.emit();
      await this.delay(120 / this.settings.animSpeed);
    }
    this.aiPlan = [];
    this.busy = false;
    if ((this.state.phase as string) === 'over') {
      this.onGameOver();
    } else {
      this.finishTurn();
    }
  }

  private handleBoardClick(click: Parameters<BoardScene['callbacks']['onBoardClick']>[0]): void {
    if (this.busy || this.state.phase !== 'move' || !this.isHumanTurn) return;
    if (click.type === 'checker' && click.player !== this.state.currentPlayer) {
      // клик по чужой фишке: если это блот на пункте-цели — ход с выбитием
      if (this.selected !== null && typeof click.from === 'number') {
        const legal = this.engine.legalMovesFrom(this.selected).find((m) => m.to === click.from);
        if (legal) {
          void this.playHumanMove(legal);
          return;
        }
      }
      return;
    }
    if (click.type === 'checker') {
      // клик по своей фишке на пункте-цели = ход на этот пункт
      // (иначе нельзя было бы ходить на свои же занятые пункты)
      if (this.selected !== null && this.selected !== click.from) {
        const legal = this.engine.legalMovesFrom(this.selected).find((m) => m.to === click.from);
        if (legal) {
          void this.playHumanMove(legal);
          return;
        }
      }
      if (this.selected === click.from) {
        this.selected = null;
        sound.play('select');
      } else if (this.engine.legalSources().includes(click.from)) {
        this.selected = click.from;
        sound.play('select');
      }
      this.updateHighlights();
      this.emit();
      return;
    }
    if (this.selected !== null) {
      let to: number | 'off' | null = null;
      if (click.type === 'point') to = click.point;
      else if (click.type === 'tray') to = 'off';
      const legal = this.engine.legalMovesFrom(this.selected).find((m) => m.to === to);
      if (legal) void this.playHumanMove(legal);
    }
  }

  private handleDragMove(from: number | 'bar', to: number | 'off'): void {
    if (this.busy || this.state.phase !== 'move' || !this.isHumanTurn) return;
    const legal = this.engine.legalMovesFrom(from).find((m) => m.to === to);
    if (legal) void this.playHumanMove(legal);
    else this.updateHighlights();
  }

  /** Публично для автотестов: сыграть ход (с анимацией, звуком, сохранением). */
  async playHumanMove(mv: Move): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.selected = null;
    const before = cloneState(this.state);
    if (!this.engine.playMove(mv)) {
      this.busy = false;
      this.updateHighlights();
      return;
    }
    sound.play(mv.hit ? 'hit' : 'place');
    if (this.scene) await this.scene.animateMove(mv, before, this.state, this.settings.animSpeed);
    this.busy = false;
    if (this.state.phase === 'over') {
      this.onGameOver();
      return;
    }
    if (this.engine.turnFinished) {
      await this.delay(320 / this.settings.animSpeed);
      this.finishTurn();
      return;
    }
    this.statusMessage = 'Продолжайте ход';
    this.updateHighlights();
    this.emit();
    this.scheduleSave();
  }

  undo(): void {
    if (this.busy || !this.isHumanTurn || this.state.phase !== 'move') return;
    if (this.engine.undoMove()) {
      sound.play('undo');
      this.selected = null;
      if (this.scene) this.scene.syncState(this.state, true);
      this.statusMessage = 'Ход отменён';
      this.updateHighlights();
      this.emit();
      this.scheduleSave();
    }
  }

  private finishTurn(): void {
    if (this.state.phase === 'over') return;
    this.engine.endTurn();
    this.statusMessage = `Ход: ${this.playerName(this.state.currentPlayer)}`;
    this.newTurnUI();
    this.emit();
    this.scheduleSave();
    if (this.state.phase === 'roll' && !this.isHumanTurn) {
      void this.aiRollWithDelay();
    }
  }

  private async aiRollWithDelay(): Promise<void> {
    await this.delay(650 / this.settings.animSpeed);
    if (this.state.phase === 'roll' && !this.isHumanTurn) await this.roll();
  }

  private onGameOver(): void {
    const w = this.state.winner!;
    const pts = { oin: 1, mars: 2, koks: 3, home: 4 }[this.state.outcome] ?? 1;
    this.score.wins[w] += pts;
    if (this.state.mars) this.score.mars[w]++;
    this.saveScore();
    sound.play('victory');
    if (this.scene) this.scene.setHighlights([], [], null);
    this.clearSave();
    this.statusMessage = '';
    this.emit();
  }

  playerCanAct(): boolean {
    return !this.busy && this.state.phase === 'move' && this.isHumanTurn && this.engine.canMove();
  }

  /** публичное обновление подписчиков (после внешних манипуляций) */
  refresh(): void {
    this.emit();
  }

  /** Реванш: новая партия в том же режиме */
  rematch(): void {
    this.engine.newGame(this.config.mode, Math.random() < 0.5 ? 0 : 1);
    this.statusMessage = `Первым ходит: ${this.playerName(this.state.currentPlayer)}`;
    this.selected = null;
    if (this.scene) {
      this.scene.syncState(this.state, false);
      this.scene.setDiceVisible(false);
      this.scene.setHighlights([], [], null);
    }
    this.saveNow();
    this.emit();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  }

  // ---------- сохранение партии ----------
  scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 400);
  }
  saveNow(): void {
    if (this.state.phase === 'over') return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        state: this.state,
        config: this.config,
      }));
    } catch { /* ignore */ }
  }
  clearSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }
  static hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }
  static loadSave(): { state: GameState; config: GameConfig } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.state || !data.config) return null;
      return data;
    } catch {
      return null;
    }
  }

  /** Восстановить контроллер из сохранения */
  static fromSave(scene: BoardScene | null): GameController | null {
    const data = GameController.loadSave();
    if (!data) return null;
    const c = new GameController(data.config);
    c.engine.state = data.state;
    // старые сохранения без поля outcome
    if (!c.engine.state.outcome) c.engine.state.outcome = c.engine.state.mars ? 'mars' : 'oin';
    // перегенерируем последовательности, если партия была на этапе хода
    if (data.state.phase === 'move' && data.state.dice) {
      c.engine.sequences = generateSequences(data.state, c.engine.rules, data.state.dice);
      if (!c.engine.canMove() && c.engine.played.length === 0) {
        // ход не начинался и ходов нет — откатываемся к этапу броска
        c.engine.state = { ...data.state, phase: 'roll', dice: null, remainingDice: [] };
        c.engine.sequences = [];
      }
    }
    if (scene) c.attachScene(scene);
    return c;
  }

  // ---------- отладочные команды (ТЗ §19) ----------
  debugSetDice(d1: number, d2: number): void {
    if (this.state.phase !== 'roll') return;
    void this.roll(d1, d2);
  }
  debugSwitchPlayer(): void {
    this.engine.endTurn();
    this.newTurnUI();
    this.emit();
  }
  debugLoadPosition(mode: GameMode, name: string): void {
    const st = this.engine.state;
    st.points = [new Array(24).fill(0), new Array(24).fill(0)];
    st.bar = [0, 0];
    st.off = [0, 0];
    st.phase = 'roll';
    st.dice = null;
    st.winner = null;
    st.mars = false;
    st.outcome = 'oin';
    st.turnsTaken = [2, 2];
    const put = (pl: PlayerId, pts: Array<[number, number]>) => {
      for (const [p, n] of pts) st.points[pl][p] = n;
    };
    if (mode === 'long') {
      if (name === 'start') put(0, [[23, 15]]), put(1, [[11, 15]]);
      else if (name === 'block') {
        // белый замыкает блок прогресса 1..6, все 15 чёрных ещё впереди
        put(0, [[23, 1], [21, 1], [20, 1], [19, 1], [18, 1], [17, 1]]);
        put(1, [[12, 15]]);
      } else if (name === 'bearing') {
        put(0, [[5, 1], [1, 14]]); // прогресс 18 и 22
        st.off = [11, 0];
        put(1, [[12, 15]]);
        st.turnsTaken = [10, 10];
      } else if (name === 'race') {
        // белый: прогресс 16(x3),18(x2),19(x2),20(x3),21(x3),22,23
        put(0, [[7, 3], [5, 2], [4, 2], [3, 3], [2, 3], [1, 1], [0, 1]]);
        // чёрный: прогресс 5(x3),6(x2),7(x3),8(x3),9,10,11(x2)
        put(1, [[6, 3], [5, 2], [4, 3], [3, 3], [2, 1], [1, 1], [0, 2]]);
        st.turnsTaken = [8, 8];
      }
    } else {
      if (name === 'blot') {
        put(0, [[23, 2], [12, 4], [7, 3], [5, 5], [8, 1]]);
        put(1, [[0, 2], [11, 5], [16, 3], [18, 4], [15, 1]]);
      } else if (name === 'bar') {
        put(0, [[12, 14]]);
        st.bar = [1, 0];
        put(1, [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]]);
      } else if (name === 'bearing') {
        put(0, [[0, 1]]);
        st.off = [14, 0];
        put(1, [[23, 2], [12, 5], [7, 3], [5, 5]]);
        st.turnsTaken = [10, 10];
      } else if (name === 'hitfest') {
        put(0, [[23, 1], [12, 6], [7, 4], [5, 4]]);
        put(1, [[0, 1], [11, 6], [16, 4], [18, 4]]);
      }
    }
    this.engine.sequences = [];
    this.engine.played = [];
    this.selected = null;
    if (this.scene) {
      this.scene.syncState(this.state, false);
      this.scene.setDiceVisible(false);
    }
    this.newTurnUI();
    this.emit();
  }
  debugToBearingOff(): void {
    const st = this.engine.state;
    const dir = this.engine.rules.direction(0);
    st.points = [new Array(24).fill(0), new Array(24).fill(0)];
    st.bar = [0, 0];
    // всё по 5 на старших пунктах дома, кроме 2 фишек
    if (st.mode === 'long') {
      // старшие пункты дома: белый — прогресс 23,22,21 = п.0,1,2;
      // чёрный — прогресс 23,22,21 = п.12,13,14
      st.points[0][0] = 5; st.points[0][1] = 5; st.points[0][2] = 3;
      st.points[1][12] = 5; st.points[1][13] = 5; st.points[1][14] = 3;
    } else {
      st.points[0][0] = 5; st.points[0][1] = 5; st.points[0][2] = 3;
      st.points[1][23] = 5; st.points[1][22] = 5; st.points[1][21] = 3;
    }
    void dir;
    st.off = [2, 2];
    st.turnsTaken = [12, 12];
    st.phase = 'roll';
    st.dice = null;
    this.engine.sequences = [];
    if (this.scene) {
      this.scene.syncState(this.state, false);
      this.scene.setDiceVisible(false);
    }
    this.newTurnUI();
    this.emit();
  }
}
