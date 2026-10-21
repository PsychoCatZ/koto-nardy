import * as THREE from 'three';
import { checkerTopTexture } from './textures';

// ============================================================
// Котофишки — объёмная кошачья лапка: подушечка + четыре пальца
// ============================================================

/**
 * Силуэт лапки как единый контур: подушечка + 4 пальца.
 * Контур — граница объединения пяти окружностей; строится лучевым
 * сканированием от центра подушечки (объединение звёздно-образно).
 */
function pawOutline(scale: number): THREE.Shape {
  interface C { x: number; y: number; r: number }
  const circles: C[] = [
    { x: 0, y: -0.06, r: 0.36 },      // подушечка
    { x: -0.31, y: 0.30, r: 0.175 },  // мизинец
    { x: -0.105, y: 0.44, r: 0.175 }, // безымянный
    { x: 0.105, y: 0.44, r: 0.175 },  // средний
    { x: 0.31, y: 0.30, r: 0.175 },   // указательный
  ];
  const cx = 0, cy = -0.06; // центр сканирования (внутри подушечки)
  const N = 288;
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    // выход из подушечки
    let tBest = circles[0].r;
    // ближайшая точка пересечения луча с окружностью
    const intersect = (c: C): [number, number] | null => {
      const ox = cx - c.x, oy = cy - c.y;
      const b = ox * dx + oy * dy;
      const cc = ox * ox + oy * oy - c.r * c.r;
      const disc = b * b - cc;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      return [-b - sq, -b + sq];
    };
    const padInt = intersect(circles[0])!;
    tBest = padInt[1];
    for (let i = 1; i < circles.length; i++) {
      const hit = intersect(circles[i]);
      if (!hit) continue;
      const [t1, t2] = hit;
      // палец учитывается, только если он перекрывается с подушечкой
      // по этому лучу (нет разрыва): вход в палец раньше выхода из подушечки
      if (t1 <= tBest + 1e-6) tBest = Math.max(tBest, t2);
    }
    pts.push(new THREE.Vector2(cx + dx * tBest * scale, cy + dy * tBest * scale));
  }
  const s = new THREE.Shape();
  s.setFromPoints(pts);
  return s;
}

export interface CheckerMaterials {
  light: THREE.MeshStandardMaterial[];
  dark: THREE.MeshStandardMaterial[];
}

export function createCheckerMaterials(): CheckerMaterials {
  const lightSide = new THREE.MeshStandardMaterial({
    color: '#e3d3b8', roughness: 0.55, metalness: 0.08,
  });
  const lightTop = new THREE.MeshStandardMaterial({
    map: checkerTopTexture(false), roughness: 0.5, metalness: 0.05,
  });
  const darkSide = new THREE.MeshStandardMaterial({
    color: '#2a2226', roughness: 0.42, metalness: 0.3,
  });
  const darkTop = new THREE.MeshStandardMaterial({
    map: checkerTopTexture(true), roughness: 0.4, metalness: 0.25,
  });
  // ExtrudeGeometry: 0 — нижняя крышка, 1 — верхняя крышка, 2 — боковины
  return {
    light: [lightSide, lightTop, lightSide, lightSide, lightSide, lightSide],
    dark: [darkSide, darkTop, darkSide, darkSide, darkSide, darkSide],
  };
}

let cachedGeometry: THREE.ExtrudeGeometry | null = null;

export function checkerGeometry(): THREE.ExtrudeGeometry {
  if (cachedGeometry) return cachedGeometry;
  const shape = pawOutline(0.78);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.045,
    bevelSegments: 3,
    curveSegments: 24,
  });
  geo.rotateX(-Math.PI / 2); // лежит плоско, «пальцы» вперёд
  geo.computeBoundingBox();
  // центрируем
  const bb = geo.boundingBox!;
  const cx = (bb.max.x + bb.min.x) / 2;
  const cz = (bb.max.z + bb.min.z) / 2;
  geo.translate(-cx, 0, -cz);
  // нормализуем UV крышек в 0..1 (ExtrudeGeometry кладёт в UV координаты контура)
  geo.computeBoundingBox();
  const bb2 = geo.boundingBox!;
  const spanX = bb2.max.x - bb2.min.x;
  const spanZ = bb2.max.z - bb2.min.z;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb2.min.x) / spanX, (pos.getZ(i) - bb2.min.z) / spanZ);
  }
  uv.needsUpdate = true;
  cachedGeometry = geo;
  return geo;
}

/** Создать меш фишки для игрока */
export function createChecker(player: 0 | 1, mats: CheckerMaterials): THREE.Mesh {
  const mesh = new THREE.Mesh(checkerGeometry(), player === 0 ? mats.light : mats.dark);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.player = player;
  return mesh;
}
