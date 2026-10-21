import * as THREE from 'three';
import { diceFaceTexture } from './textures';

// ============================================================
// 3D-кубики с гранями-отпечатками и псевдофизическим броском
// ============================================================

/** Локальные нормали граней кубика; индекс массива = значение кубика 1..6 */
const FACE_NORMALS: THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),    // 1 — верх
  new THREE.Vector3(0, 0, 1),    // 2 — перед
  new THREE.Vector3(1, 0, 0),    // 3 — право
  new THREE.Vector3(-1, 0, 0),   // 4 — лево
  new THREE.Vector3(0, 0, -1),  // 5 — зад
  new THREE.Vector3(0, -1, 0),   // 6 — низ
];

export function createDie(): THREE.Mesh {
  // Порядок материалов BoxGeometry: +x, -x, +y, -y, +z, -z
  const faceByNormal: Record<string, number> = {
    '0,1,0': 1, '0,0,1': 2, '1,0,0': 3, '-1,0,0': 4, '0,0,-1': 5, '0,-1,0': 6,
  };
  const ordered = [
    faceByNormal['1,0,0'], faceByNormal['-1,0,0'], faceByNormal['0,1,0'],
    faceByNormal['0,-1,0'], faceByNormal['0,0,1'], faceByNormal['0,0,-1'],
  ].map((v) => new THREE.MeshStandardMaterial({
    map: diceFaceTexture(v), roughness: 0.32, metalness: 0.06,
  }));
  const geo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  const mesh = new THREE.Mesh(geo, ordered);
  mesh.castShadow = true;
  mesh.userData.isDie = true;
  return mesh;
}

/**
 * Кватернион, при котором грань `value` смотрит вверх (+Y),
 * со случайным поворотом вокруг вертикали.
 */
export function uprightQuaternion(value: number): THREE.Quaternion {
  const normal = FACE_NORMALS[value - 1];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(normal, up);
  const spin = new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2);
  return spin.multiply(q);
}

export interface DiceAnimation {
  done: boolean;
  update(dt: number): void;
}

/**
 * Анимация броска: кубик взлетает с бара, кувыркается и приземляется
 * гранью `value` вверх. Скорость регулируется множителем speed.
 */
export function animateDiceRoll(
  die: THREE.Mesh,
  from: THREE.Vector3,
  to: THREE.Vector3,
  value: number,
  speed = 1,
): DiceAnimation {
  const duration = 0.9 / speed;
  let t = 0;
  const startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2,
  ));
  const endQ = uprightQuaternion(value);
  const tumbleAxis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  const tumbleAngle = Math.PI * 2 * (2 + Math.floor(Math.random() * 2));
  const bounceH = 1.1 + Math.random() * 0.4;
  return {
    done: false,
    update(dt: number) {
      if (this.done) return;
      t = Math.min(duration, t + dt);
      const k = t / duration;
      // позиция: парабола + лёгкий отскок к концу
      const p = new THREE.Vector3().lerpVectors(from, to, k);
      p.y += Math.sin(k * Math.PI) * bounceH;
      if (k > 0.82) {
        const kb = (k - 0.82) / 0.18;
        p.y += Math.abs(Math.sin(kb * Math.PI * 2)) * 0.14 * (1 - kb);
      }
      die.position.copy(p);
      // вращение: быстрое в начале, к endQ в конце
      const spin = new THREE.Quaternion().setFromAxisAngle(tumbleAxis, tumbleAngle * (1 - Math.pow(1 - k, 2)));
      const q = new THREE.Quaternion().slerpQuaternions(startQ, endQ, Math.pow(k, 2.2));
      die.quaternion.copy(spin.multiply(q));
      if (t >= duration) {
        die.position.copy(to);
        die.quaternion.copy(endQ);
        this.done = true;
      }
    },
  };
}
