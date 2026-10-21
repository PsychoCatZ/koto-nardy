import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GameState, Move, PlayerId, PointIndex } from '../game/types';
import { L, BOARD_W, BOARD_D, SURFACE_Y, pointPosition, trayPosition, barPosition } from './layout';
import { woodTexture, fieldTexture, barTexture, frameTexture } from './textures';
import { createChecker, createCheckerMaterials } from './pieces';
import type { CheckerMaterials } from './pieces';
import { createDie, animateDiceRoll, uprightQuaternion } from './dice';

export type BoardClick =
  | { type: 'checker'; from: PointIndex | 'bar'; player: PlayerId }
  | { type: 'point'; point: PointIndex }
  | { type: 'bar' }
  | { type: 'tray'; player: PlayerId }
  | { type: 'empty' };

export interface SceneCallbacks {
  onBoardClick(click: BoardClick): void;
  onDragMove(from: PointIndex | 'bar', to: PointIndex | 'off'): void;
  onCameraUserInteract(): void;
}

type CheckerLoc =
  | { kind: 'point'; p: PointIndex; idx: number }
  | { kind: 'bar'; idx: number }
  | { kind: 'off'; idx: number };

interface Anim {
  done: boolean;
  update(dt: number): void;
}

export type Quality = 'low' | 'medium' | 'high';

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class BoardScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private boardGroup: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  private mats: CheckerMaterials;
  private checkers: THREE.Mesh[] = [];       // 0..14 белый, 15..29 чёрный
  private checkerLocs: CheckerLoc[] = [];
  private lastState: GameState | null = null;
  private dice: THREE.Mesh[] = [];
  private pointMeshes: THREE.Mesh[] = [];
  private barMesh!: THREE.Mesh;
  private trayMeshes: THREE.Mesh[] = [];
  private highlightGroup = new THREE.Group();

  private anims: Anim[] = [];
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;

  private quality: Quality = 'high';
  private shadowsOn = true;
  private camTween: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; fromTarget?: THREE.Vector3 } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** уровень авто-деградации графики: 0 — полная, 1 — без теней, 2 — режим совместимости */
  compatLevel = 0;
  private healthCheckFrame = 0;

  // drag & drop state
  private dragCandidate: { from: PointIndex | 'bar'; player: PlayerId; mesh: THREE.Mesh } | null = null;
  private dragging: { from: PointIndex | 'bar'; player: PlayerId; mesh: THREE.Mesh; startX: number; startY: number; moved: boolean } | null = null;
  private legalTargets: Array<PointIndex | 'off'> = [];
  private legalSources: Array<PointIndex | 'bar'> = [];
  private inputEnabled = true;

  callbacks: SceneCallbacks = {
    onBoardClick: () => undefined,
    onDragMove: () => undefined,
    onCameraUserInteract: () => undefined,
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#14100d');

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 13.5, 13.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 32;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('start', () => {
      this.camTween = null;
      this.callbacks.onCameraUserInteract();
    });

    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);
    this.scene.add(this.highlightGroup);

    this.buildLights();
    this.buildTable();
    this.buildBoard();

    this.mats = createCheckerMaterials();
    for (let i = 0; i < 30; i++) {
      const mesh = createChecker(i < 15 ? 0 : 1, this.mats);
      mesh.userData.checkerId = i;
      this.checkers.push(mesh);
      this.boardGroup.add(mesh);
    }
    for (let i = 0; i < 2; i++) {
      const die = createDie();
      die.visible = false;
      this.dice.push(die);
      this.boardGroup.add(die);
    }

    this.bindPointer();
    this.watchContextLoss();
    this.resize();
    window.addEventListener('resize', this.resize);
    // контейнер может менять размер без resize окна (превью-панель, мобильный браузер)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.loop();
  }

  /** Потеря/восстановление GPU-контекста: перекомпилируем материалы, сбрасываем тени. */
  private watchContextLoss(): void {
    const el = this.renderer.domElement;
    el.addEventListener('webglcontextlost', (e) => e.preventDefault());
    el.addEventListener('webglcontextrestored', () => {
      this.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) mm.needsUpdate = true;
        }
      });
      if (this.keyLight.shadow) {
        this.keyLight.shadow.map?.dispose();
        this.keyLight.shadow.map = null;
      }
    });
  }

  // ---------------- построение сцены ----------------

  private buildLights(): void {
    const ambient = new THREE.HemisphereLight('#fff2dd', '#241812', 0.55);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight('#ffe8c4', 1.9);
    key.position.set(7, 15, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.camera.far = 45;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fb6ff', 0.5);
    rim.position.set(-8, 9, -7);
    this.scene.add(rim);
    this.keyLight = key;
  }
  private keyLight!: THREE.DirectionalLight;

  private buildTable(): void {
    const tex = woodTexture('#241407', '#150a03', '#38220f');
    tex.repeat.set(6, 6);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
    const table = new THREE.Mesh(new THREE.CircleGeometry(45, 48), mat);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -L.thick / 2 - 0.01;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  private buildBoard(): void {
    const frameTex = frameTexture();
    const wood = woodTexture();
    const frameMat = new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.6, metalness: 0.15 });
    const sideMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 });

    // основание доски
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W + L.frame * 2, L.thick, BOARD_D + L.frame * 2),
      [sideMat, sideMat, frameMat, sideMat, sideMat, sideMat],
    );
    base.position.y = -0.02;
    base.castShadow = true;
    base.receiveShadow = true;
    this.boardGroup.add(base);

    // игровое поле (войлок КотоИмперии)
    const fieldMat = new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.95 });
    const field = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, 0.06, BOARD_D), fieldMat);
    field.position.y = SURFACE_Y;
    field.receiveShadow = true;
    this.boardGroup.add(field);

    // пункты — клинья двух тонов дерева
    const lightWood = new THREE.MeshStandardMaterial({ map: woodTexture('#c8a165', '#a37c42', '#e0bd85'), roughness: 0.55 });
    const darkWood = new THREE.MeshStandardMaterial({ map: woodTexture('#4a2c17', '#33190b', '#6b4526'), roughness: 0.55 });
    const wedgeShape = new THREE.Shape();
    wedgeShape.moveTo(-L.pw / 2 + 0.05, 0);
    wedgeShape.lineTo(L.pw / 2 - 0.05, 0);
    wedgeShape.lineTo(0, L.row - 0.35);
    wedgeShape.closePath();
    const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, { depth: 0.07, bevelEnabled: false });
    wedgeGeo.rotateX(-Math.PI / 2); // лёг: ось клина теперь вдоль Z, вершина у z=0
    for (let p = 0; p < 24; p++) {
      const pos = pointPosition(p);
      const wedge = new THREE.Mesh(wedgeGeo, p % 2 === 0 ? lightWood : darkWood);
      wedge.rotation.y = pos.dirZ === 1 ? Math.PI : 0; // низ — вершиной к центру
      wedge.position.set(pos.x, SURFACE_Y + 0.031, 0);
      wedge.userData.point = p;
      wedge.receiveShadow = true;
      this.pointMeshes.push(wedge);
      this.boardGroup.add(wedge);
    }

    // бар
    const barMat = new THREE.MeshStandardMaterial({ map: barTexture(), roughness: 0.5, metalness: 0.2 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(L.barHalf * 2 + 0.08, 0.22, BOARD_D), barMat);
    bar.position.set(0, SURFACE_Y + 0.08, 0);
    bar.castShadow = true;
    bar.receiveShadow = true;
    this.barMesh = bar;
    this.boardGroup.add(bar);

    // зоны выбрасывания (лотки у торцов)
    for (const pl of [0, 1] as const) {
      const trayMat = new THREE.MeshStandardMaterial({ map: woodTexture('#3a2412', '#241205', '#54371c'), roughness: 0.65 });
      const tray = new THREE.Mesh(new THREE.BoxGeometry(L.frame + 0.3, 0.1, BOARD_D - L.frame * 0.6), trayMat);
      const x = (pl === 0 ? 1 : -1) * (BOARD_W / 2 + L.frame / 2 - 0.12);
      tray.position.set(x, SURFACE_Y + 0.02, 0);
      tray.receiveShadow = true;
      tray.userData.trayPlayer = pl;
      this.trayMeshes.push(tray);
      this.boardGroup.add(tray);
    }
  }

  // ---------------- синхронизация с игровым состоянием ----------------

  private computeLocs(state: GameState): CheckerLoc[] {
    const locs: CheckerLoc[] = new Array(30);
    for (const pl of [0, 1] as PlayerId[]) {
      let barIdx = 0;
      for (let k = 0; k < state.bar[pl]; k++) locs[pl * 15 + barIdx++] = { kind: 'bar', idx: k };
      let offIdx = 0;
      for (let k = 0; k < state.off[pl]; k++) locs[pl * 15 + offIdx++] = { kind: 'off', idx: k };
      for (let p = 0; p < 24; p++) {
        const n = state.points[pl][p];
        for (let k = 0; k < n; k++) locs[pl * 15 + offIdx++] = { kind: 'point', p, idx: k };
      }
    }
    return locs;
  }

  private locPosition(loc: CheckerLoc, player: PlayerId): THREE.Vector3 {
    if (loc.kind === 'bar') {
      const b = barPosition(player, loc.idx);
      return new THREE.Vector3(b.x, SURFACE_Y + 0.22 + loc.idx * 0.18, b.z);
    }
    if (loc.kind === 'off') {
      const t = trayPosition(player, loc.idx);
      return new THREE.Vector3(t.x, SURFACE_Y + 0.1 + loc.idx * 0.18, t.z);
    }
    const pos = pointPosition(loc.p);
    // стопка: в основном вверх, первые фишки слегка смещаются к бару
    const drift = Math.min(loc.idx, 4) * L.stackDrift;
    const stackZ = pos.dirZ * (L.row - 0.85 - drift);
    return new THREE.Vector3(pos.x, SURFACE_Y + 0.1 + loc.idx * L.stackStep, stackZ);
  }

  /** Полная пересинхронизация (загрузка, отмена, новая партия) */
  syncState(state: GameState, animate = false): void {
    this.lastState = state;
    const locs = this.computeLocs(state);
    for (let i = 0; i < 30; i++) {
      const player = (i < 15 ? 0 : 1) as PlayerId;
      const target = this.locPosition(locs[i], player);
      const mesh = this.checkers[i];
      mesh.visible = true;
      if (animate) {
        this.animateArc(mesh, mesh.position.clone(), target, 0.25);
      } else {
        mesh.position.copy(target);
      }
    }
    this.checkerLocs = locs;
    // ориентация лапки: пальцы от бара
    for (let i = 0; i < 30; i++) {
      const loc = locs[i];
      if (loc.kind === 'point') {
        this.checkers[i].rotation.y = pointPosition(loc.p).dirZ === 1 ? 0 : Math.PI;
      } else if (loc.kind === 'bar') {
        this.checkers[i].rotation.y = (i < 15 ? 0 : Math.PI);
      } else {
        this.checkers[i].rotation.y = (i < 15 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
  }

  private animateArc(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, dur: number, lift = 0.9): Promise<void> {
    return new Promise((resolve) => {
      let t = 0;
      const d = Math.max(0.05, dur);
      const anim: Anim = {
        done: false,
        update: (dt) => {
          if (anim.done) return;
          t = Math.min(d, t + dt);
          const k = easeInOut(t / d);
          const p = new THREE.Vector3().lerpVectors(from, to, k);
          p.y += Math.sin(k * Math.PI) * lift;
          mesh.position.copy(p);
          if (t >= d) {
            mesh.position.copy(to);
            anim.done = true;
            resolve();
          }
        },
      };
      this.anims.push(anim);
    });
  }

  /**
   * Анимация одного хода. prevState — позиция ДО хода.
   * Фишка ищется по её месту ДО хода в актуальных checkerLocs —
   * так анимируется именно сходившая фишка, а не «первая попавшаяся».
   */
  async animateMove(move: Move, prevState: GameState, stateAfter: GameState, speed: number): Promise<void> {
    const dur = speed >= 10 ? 0.01 : 0.42 / speed;
    const player = move.player;
    // сбитая фишка улетает на бар
    if (move.hit && move.to !== 'off') {
      const enemy = player === 0 ? 1 : 0;
      const enemyId = this.findCheckerByLoc(enemy, { kind: 'point', p: move.to as number, idx: 0 });
      if (enemyId >= 0) {
        const barLoc: CheckerLoc = { kind: 'bar', idx: stateAfter.bar[enemy] - 1 };
        const to = this.locPosition(barLoc, enemy);
        const mesh = this.checkers[enemyId];
        const away = to.clone().add(new THREE.Vector3(0, 0, enemy === 0 ? 1.2 : -1.2));
        const hop = this.animateArc(mesh, mesh.position.clone(), away, dur * 0.7, 0.7);
        const back = hop.then(() => this.animateArc(mesh, away, to, dur * 0.6, 0.3));
        void back;
        this.checkerLocs[enemyId] = barLoc;
      }
    }
    const fromLoc: CheckerLoc = move.from === 'bar'
      ? { kind: 'bar', idx: prevState.bar[player] - 1 }
      : { kind: 'point', p: move.from as number, idx: prevState.points[player][move.from as number] - 1 };
    const id = this.findCheckerByLoc(player, fromLoc);
    if (id < 0) {
      // страховка: рассинхрон — полная пересинхронизация без анимации
      this.syncState(stateAfter, false);
      return;
    }
    const targetLoc: CheckerLoc =
      move.to === 'off'
        ? { kind: 'off', idx: stateAfter.off[player] - 1 }
        : { kind: 'point', p: move.to as number, idx: stateAfter.points[player][move.to as number] - 1 };
    const to = this.locPosition(targetLoc, player);
    const mesh = this.checkers[id];
    await this.animateArc(mesh, mesh.position.clone(), to, dur);
    if (targetLoc.kind === 'point') mesh.rotation.y = pointPosition(targetLoc.p).dirZ === 1 ? 0 : Math.PI;
    else if (targetLoc.kind === 'off') mesh.rotation.y = player === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.checkerLocs[id] = targetLoc;
  }

  /** id фишки игрока, занимающей loc в текущих checkerLocs (точное совпадение). */
  private findCheckerByLoc(player: PlayerId, loc: CheckerLoc): number {
    const base = player === 0 ? 0 : 15;
    for (let k = 0; k < 15; k++) {
      const l = this.checkerLocs[base + k];
      if (!l || l.kind !== loc.kind) continue;
      if (l.kind === 'point' && loc.kind === 'point' && l.p === loc.p && l.idx === loc.idx) return base + k;
      if (l.kind !== 'point' && loc.kind !== 'point' && l.idx === loc.idx) return base + k;
    }
    return -1;
  }

  // ---------------- кубики ----------------

  setDiceVisible(v: boolean): void {
    this.dice.forEach((d) => (d.visible = v));
  }

  placeDiceIdle(positions: [THREE.Vector3, THREE.Vector3], values: [number, number]): void {
    this.dice[0].position.copy(positions[0]);
    this.dice[1].position.copy(positions[1]);
    this.dice[0].quaternion.copy(uprightQuaternion(values[0]));
    this.dice[1].quaternion.copy(uprightQuaternion(values[1]));
    this.setDiceVisible(true);
  }

  /** Анимированный бросок на бар. Возвращает promise завершения. */
  async rollDiceVisual(d1: number, d2: number, speed: number): Promise<void> {
    // кубик лёг на верхнюю грань бара: верх бара 0.64 + половина ребра 0.31
    const y = SURFACE_Y + 0.19 + 0.31 + 0.02;
    const from1 = new THREE.Vector3(-0.25, y + 2.4, -0.3);
    const from2 = new THREE.Vector3(0.25, y + 2.4, 0.3);
    const to1 = new THREE.Vector3(-0.3, y, 0.55);
    const to2 = new THREE.Vector3(0.32, y, -0.5);
    this.setDiceVisible(true);
    const a1 = animateDiceRoll(this.dice[0], from1, to1, d1, speed);
    const a2 = animateDiceRoll(this.dice[1], from2, to2, d2, speed);
    // КЛЮЧЕВОЕ: анимации обрабатывает игровой цикл сцены,
    // иначе done никогда не станет true и игра зависнет после броска.
    this.anims.push(a1, a2);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (a1.done && a2.done) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  // ---------------- подсветка ----------------

  setHighlights(
    sources: Array<PointIndex | 'bar'>,
    targets: Array<PointIndex | 'off'>,
    selected: PointIndex | 'bar' | null,
  ): void {
    this.legalSources = sources;
    this.legalTargets = targets;
    this.highlightGroup.clear();
    const mkRing = (x: number, z: number, r: number, color: number, opacity: number) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.72, r, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, SURFACE_Y + 0.16, z);
      this.highlightGroup.add(ring);
      return ring;
    };
    const mkDisc = (x: number, z: number, r: number, color: number) => {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(r, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, SURFACE_Y + 0.15, z);
      this.highlightGroup.add(disc);
    };
    // источники
    for (const s of sources) {
      if (s === 'bar') mkRing(0, 0, 0.62, 0xffd35e, 0.85);
      else {
        const pos = pointPosition(s);
        mkRing(pos.x, pos.dirZ * (L.row - 0.9), 0.5, 0xffd35e, 0.8);
      }
    }
    // цели
    for (const t of targets) {
      if (t === 'off') {
        for (const pl of [0, 1] as const) mkDisc((pl === 0 ? 1 : -1) * (BOARD_W / 2 + 0.3), 0, 0.75, 0x7fe08a);
      } else {
        const pos = pointPosition(t);
        mkDisc(pos.x, pos.dirZ * (L.row - 0.9), 0.46, 0x7fe08a);
      }
    }
    // выбранная фишка
    if (selected !== null) {
      if (selected === 'bar') mkRing(0, 0, 0.72, 0x7fd4ff, 0.95);
      else {
        const pos = pointPosition(selected);
        mkRing(pos.x, pos.dirZ * (L.row - 0.9), 0.58, 0x7fd4ff, 0.95);
      }
    }
  }

  // ---------------- камера ----------------

  private tweenCam(to: THREE.Vector3, dur = 0.7): void {
    this.camTween = { from: this.camera.position.clone(), to, t: 0, dur };
  }

  /** Вид игрока: его дом — внизу, ближе к камере */
  viewForPlayer(player: PlayerId): void {
    const dir = player === 0 ? 1 : -1;
    const pos = new THREE.Vector3(0, 13.5, 13.2 * dir);
    this.tweenCam(pos);
  }

  viewTop(): void {
    this.tweenCam(new THREE.Vector3(0, 26, 0.6));
  }

  /** Поворот доски на 180° (логическая нумерация не меняется) */
  flipBoard(): void {
    const target = this.boardGroup.rotation.y + Math.PI;
    const start = this.boardGroup.rotation.y;
    let t = 0;
    const dur = 0.7;
    const anim: Anim = {
      done: false,
      update: (dt) => {
        if (anim.done) return;
        t = Math.min(dur, t + dt);
        this.boardGroup.rotation.y = start + (target - start) * easeInOut(t / dur);
        if (t >= dur) anim.done = true;
      },
    };
    this.anims.push(anim);
  }

  /** Автоповорот камеры к текущему игроку */
  rotateToPlayer(player: PlayerId): void {
    this.viewForPlayer(player);
  }

  setCameraSensitivity(v: number): void {
    this.controls.rotateSpeed = v;
    this.controls.zoomSpeed = v;
    this.controls.panSpeed = v;
  }

  /** Проекция мировой точки в экранные пиксели канваса (для автотестов и подсказок). */
  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    };
  }

  /** Экранные координаты первой фишки на пункте (или на баре), для автотестов. */
  checkerScreenPoint(p: PointIndex | 'bar'): { x: number; y: number } | null {
    const loc = this.checkerLocs.find((l) => (p === 'bar' ? l.kind === 'bar' : l.kind === 'point' && l.p === p));
    if (!loc) return null;
    const w = this.locPosition(loc, this.lastState?.currentPlayer ?? 0);
    return this.worldToScreen(w.x, w.y, w.z);
  }

  /** Экранные координаты области пункта / бара / лотка сброса (для автотестов). */
  targetScreenPoint(t: PointIndex | 'off' | 'bar'): { x: number; y: number } {
    if (t === 'off') return this.worldToScreen(BOARD_W / 2 + 0.3, SURFACE_Y + 0.15, 0);
    if (t === 'bar') return this.worldToScreen(0, SURFACE_Y + 0.3, 0);
    const pos = pointPosition(t);
    return this.worldToScreen(pos.x, SURFACE_Y + 0.15, pos.dirZ * (L.row - 0.9));
  }

  /** Текущие подсвеченные источники/цели. */
  getHighlights(): { sources: Array<PointIndex | 'bar'>; targets: Array<PointIndex | 'off'> } {
    return { sources: [...this.legalSources], targets: [...this.legalTargets] };
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const px = q === 'low' ? 0.7 : q === 'medium' ? 1.0 : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(px);
    this.keyLight.castShadow = this.shadowsOn && q !== 'low';
    this.resize();
  }

  setShadows(on: boolean): void {
    this.shadowsOn = on;
    this.renderer.shadowMap.enabled = on;
    this.keyLight.castShadow = on && this.quality !== 'low';
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.material = m.material; // перекомпиляция материалов
      }
    });
  }

  // ---------------- ввод ----------------

  setInputEnabled(v: boolean): void {
    this.inputEnabled = v;
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.style.touchAction = 'none';
  }

  private setRay(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
  }

  private pickBoard(e: PointerEvent, exclude?: THREE.Mesh): BoardClick {
    this.setRay(e);
    const checkers = exclude ? this.checkers.filter((c) => c !== exclude) : this.checkers;
    const hits = this.raycaster.intersectObjects([...checkers, ...this.pointMeshes, this.barMesh, ...this.trayMeshes], false);
    for (const h of hits) {
      const obj = h.object as THREE.Mesh;
      if (obj.userData.checkerId !== undefined) {
        const id = obj.userData.checkerId as number;
        const player = (id < 15 ? 0 : 1) as PlayerId;
        const loc = this.checkerLocs[id];
        if (loc.kind === 'point') return { type: 'checker', from: loc.p, player };
        if (loc.kind === 'bar') return { type: 'checker', from: 'bar', player };
        continue; // снятые не кликабельны
      }
      if (obj.userData.point !== undefined) return { type: 'point', point: obj.userData.point as PointIndex };
      if (obj.userData.trayPlayer !== undefined) return { type: 'tray', player: obj.userData.trayPlayer as PlayerId };
      if (obj === this.barMesh) return { type: 'bar' };
    }
    return { type: 'empty' };
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.inputEnabled) return;
    soundGuard();
    const hit = this.pickBoard(e);
    if (hit.type === 'checker' && this.legalSources.includes(hit.from)) {
      this.dragCandidate = { from: hit.from, player: hit.player, mesh: this.checkers.find((c) => {
        const id = c.userData.checkerId as number;
        const loc = this.checkerLocs[id];
        return (loc.kind === 'point' ? loc.p : 'bar') === hit.from && (id < 15 ? 0 : 1) === hit.player;
      })! };
      this.dragging = { ...this.dragCandidate, startX: e.clientX, startY: e.clientY, moved: false };
    }
  }

  private dragPlanePoint(e: PointerEvent): THREE.Vector3 | null {
    this.setRay(e);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(SURFACE_Y + 1.1));
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging || !this.inputEnabled) return;
    const dx = e.clientX - this.dragging.startX;
    const dy = e.clientY - this.dragging.startY;
    if (!this.dragging.moved && Math.hypot(dx, dy) > 6) {
      this.dragging.moved = true;
      this.controls.enabled = false;
    }
    if (this.dragging.moved) {
      const p = this.dragPlanePoint(e);
      if (p) {
        // в локальные координаты доски
        this.boardGroup.worldToLocal(p);
        this.dragging.mesh.position.set(p.x, SURFACE_Y + 1.1, p.z);
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.inputEnabled) {
      this.dragging = null;
      return;
    }
    const drag = this.dragging;
    this.dragging = null;
    this.controls.enabled = true;
    if (drag?.moved) {
      // drop: что под курсором? (перетаскиваемая фишка исключена —
      // иначе её собственный меш перехватывал бы луч)
      const hit = this.pickBoard(e, drag.mesh);
      let to: PointIndex | 'off' | null = null;
      if (hit.type === 'point') to = hit.point;
      else if (hit.type === 'checker' && typeof hit.from === 'number') to = hit.from; // блот соперника
      else if (hit.type === 'tray') to = 'off';
      if (to !== null && this.legalTargets.includes(to)) {
        this.callbacks.onDragMove(drag.from, to);
      } else {
        this.snapBack(drag);
      }
      return;
    }
    // клик
    const hit = this.pickBoard(e);
    this.callbacks.onBoardClick(hit);
  }

  private snapBack(drag: { from: PointIndex | 'bar'; mesh: THREE.Mesh }): void {
    // вернуть фишку в стопку по текущим locs
    const id = drag.mesh.userData.checkerId as number;
    const player = (id < 15 ? 0 : 1) as PlayerId;
    const loc = this.checkerLocs[id];
    const to = this.locPosition(loc, player);
    this.animateArc(drag.mesh, drag.mesh.position.clone(), to, 0.2, 0.4);
  }

  // ---------------- цикл ----------------

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    for (const a of this.anims) a.update(dt);
    this.anims = this.anims.filter((a) => !a.done);
    if (this.camTween) {
      this.camTween.t += dt;
      const k = easeInOut(Math.min(1, this.camTween.t / this.camTween.dur));
      this.camera.position.lerpVectors(this.camTween.from, this.camTween.to, k);
      if (this.camTween.t >= this.camTween.dur) this.camTween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    // самодиагностика: если освещённый рендер чёрный (видны только
    // неосвещённые подсветки) — аккуратно деградируем графику
    if (this.healthCheckFrame < 12 && this.healthCheckFrame % 3 === 0) {
      this.runRenderHealthCheck();
    }
    if (this.healthCheckFrame < 12) this.healthCheckFrame++;
  };

  /** Читает кадр и проверяет, не чёрный ли он целиком. */
  private runRenderHealthCheck(): void {
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (!w || !h) return;
    const px = new Uint8Array(4);
    let max = 0;
    for (let iy = 1; iy <= 5; iy++) {
      for (let ix = 1; ix <= 7; ix++) {
        gl.readPixels(Math.floor((ix / 8) * w), Math.floor((iy / 6) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        max = Math.max(max, px[0], px[1], px[2]);
      }
    }
    if (max < 30) this.degradeGraphics();
  }

  /** Пошаговая деградация: 1 — выкл. тени + сильнее свет, 2 — плоские материалы. */
  private degradeGraphics(): void {
    if (this.compatLevel >= 2) return;
    this.compatLevel++;
    if (this.compatLevel === 1) {
      this.renderer.shadowMap.enabled = false;
      this.keyLight.castShadow = false;
      this.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) mm.needsUpdate = true;
        }
      });
      const hemi = this.scene.children.find((c) => (c as THREE.HemisphereLight).isHemisphereLight) as
        | THREE.HemisphereLight
        | undefined;
      if (hemi) hemi.intensity = 1.6;
    } else {
      // режим совместимости: неосвещённые материалы — доска остаётся читаемой
      const convert = (mm: THREE.Material): THREE.MeshBasicMaterial => {
        const std = mm as THREE.MeshStandardMaterial;
        return new THREE.MeshBasicMaterial({
          map: std.map ?? null,
          color: std.color ? std.color.clone() : new THREE.Color(0xcccccc),
          transparent: mm.transparent,
          opacity: mm.opacity,
        });
      };
      this.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = Array.isArray(m.material) ? m.material.map(convert) : convert(m.material);
      });
    }
  }

  resize = (): void => {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}

/** Пользовательский жест — разблокировка звука */
import { sound } from '../audio/sound';
let soundUnlocked = false;
function soundGuard(): void {
  if (!soundUnlocked) {
    soundUnlocked = true;
    sound.unlock();
  }
}
