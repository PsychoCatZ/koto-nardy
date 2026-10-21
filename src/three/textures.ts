import * as THREE from 'three';

// ============================================================
// Процедурные canvas-текстуры: дерево, гравировки котов, кубики
// ============================================================

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTex(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

/** Дерево: волнистые волокна + шум */
export function woodTexture(base = '#5a3a22', dark = '#3c2513', light = '#7a5330'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 512;
    const h = 1 + Math.random() * 5;
    g.strokeStyle = Math.random() < 0.5 ? dark : light;
    g.globalAlpha = 0.05 + Math.random() * 0.16;
    g.lineWidth = h;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) {
      const yy = y + Math.sin((x + i * 37) * 0.02) * 6 + Math.sin(x * 0.11 + i) * 1.5;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  // сучки
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 6 + Math.random() * 14;
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, 'rgba(30,18,8,0.5)');
    grad.addColorStop(1, 'rgba(30,18,8,0)');
    g.globalAlpha = 1;
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  return toTex(c, 2, 2);
}

/** Отпечаток лапы в canvas-координатах */
export function drawPaw(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, alpha = 1) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = alpha;
  g.fillStyle = color;
  // подушечка
  g.beginPath();
  g.ellipse(0, s * 0.25, s * 0.42, s * 0.36, 0, 0, Math.PI * 2);
  g.fill();
  // три пальца снизу + один сверху
  const toes: Array<[number, number, number]> = [
    [-0.42, -0.28, 0.17], [0, -0.42, 0.19], [0.42, -0.28, 0.17], [0, 0.75, 0.15],
  ];
  for (const [dx, dy, r] of toes) {
    g.beginPath();
    g.ellipse(dx * s, dy * s, r * s, r * s * 1.25, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Силуэт сидящего кота */
export function drawSittingCat(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, alpha = 1) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  // тело
  g.moveTo(0, 0);
  g.bezierCurveTo(-0.55, -0.05, -0.6, -0.75, -0.35, -1.05);
  // спина к голове
  g.bezierCurveTo(-0.3, -1.25, -0.28, -1.4, -0.22, -1.52);
  // ухо левое
  g.lineTo(-0.34, -1.78);
  g.lineTo(-0.13, -1.66);
  // макушка
  g.lineTo(0.0, -1.7);
  // ухо правое
  g.lineTo(0.13, -1.66);
  g.lineTo(0.34, -1.78);
  g.lineTo(0.22, -1.52);
  // голова/морда
  g.bezierCurveTo(0.28, -1.4, 0.3, -1.25, 0.35, -1.05);
  // грудь
  g.bezierCurveTo(0.6, -0.75, 0.55, -0.05, 0, 0);
  g.closePath();
  g.fill();
  // хвост вокруг лап
  g.beginPath();
  g.moveTo(0.05, -0.05);
  g.bezierCurveTo(0.75, -0.1, 0.85, -0.65, 0.45, -0.85);
  g.bezierCurveTo(0.8, -0.6, 0.72, -0.05, 0.02, 0.08);
  g.closePath();
  g.fill();
  g.restore();
}

/** Центральная часть доски: территория КотоИмперии с тропой лап */
export function fieldTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 768);
  // кожа/войлок тёмно-вишнёвый
  const grad = g.createLinearGradient(0, 0, 1024, 768);
  grad.addColorStop(0, '#46222a');
  grad.addColorStop(0.5, '#3a1c22');
  grad.addColorStop(1, '#46222a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 768);
  // текстура войлока
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,220,200,0.018)' : 'rgba(0,0,0,0.03)';
    g.fillRect(Math.random() * 1024, Math.random() * 768, 1.6, 1.6);
  }
  // тропа лап по периметру (гравировка)
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    drawPaw(g, 40 + t * 944, 40, 14, '#1e0d10', 0.5);
    drawPaw(g, 40 + t * 944, 728, 14, '#1e0d10', 0.5);
  }
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    drawPaw(g, 40, 40 + t * 688, 14, '#1e0d10', 0.5);
    drawPaw(g, 984, 40 + t * 688, 14, '#1e0d10', 0.5);
  }
  // силуэт кота в углах
  drawSittingCat(g, 120, 620, 90, '#1e0d10', 0.55);
  drawSittingCat(g, 904, 620, -90, '#1e0d10', 0.55);
  return toTex(c);
}

/** Бар: тёмное дерево с мордой чёрного кота и глазами */
export function barTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 1024);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#2b1a10');
  grad.addColorStop(0.5, '#3d2716');
  grad.addColorStop(1, '#2b1a10');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1 + Math.random() * 3;
    const x = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 10, 300, x - 10, 700, x + 5, 1024);
    g.stroke();
  }
  // морда чёрного кота — гравировка по центру бара
  g.save();
  g.translate(128, 512);
  g.fillStyle = 'rgba(12,6,3,0.85)';
  // голова
  g.beginPath();
  g.ellipse(0, 10, 62, 55, 0, 0, Math.PI * 2);
  g.fill();
  // уши
  g.beginPath();
  g.moveTo(-52, -22); g.lineTo(-70, -72); g.lineTo(-22, -44); g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(52, -22); g.lineTo(70, -72); g.lineTo(22, -44); g.closePath(); g.fill();
  // глаза — янтарные, слегка светятся
  const eye = (ex: number) => {
    const eg = g.createRadialGradient(ex, -6, 2, ex, -6, 16);
    eg.addColorStop(0, '#ffd35e');
    eg.addColorStop(0.6, '#c98a1e');
    eg.addColorStop(1, 'rgba(60,35,5,0.9)');
    g.fillStyle = eg;
    g.beginPath();
    g.ellipse(ex, -6, 13, 15, 0, 0, Math.PI * 2);
    g.fill();
    // зрачок
    g.fillStyle = '#12080a';
    g.beginPath();
    g.ellipse(ex, -6, 3.2, 11, 0, 0, Math.PI * 2);
    g.fill();
  };
  eye(-26); eye(26);
  // нос и усы
  g.fillStyle = '#3a1d22';
  g.beginPath();
  g.moveTo(-7, 26); g.lineTo(7, 26); g.lineTo(0, 36); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(200,170,140,0.4)';
  g.lineWidth = 1.4;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(s * 12, 30 + i * 5);
      g.lineTo(s * 58, 22 + i * 9);
      g.stroke();
    }
  }
  g.restore();
  // лапки вдоль бара
  drawPaw(g, 128, 130, 20, 'rgba(12,6,3,0.7)');
  drawPaw(g, 128, 894, 20, 'rgba(12,6,3,0.7)');
  return toTex(c);
}

/** Рамка доски с латунной каймой и кошачьим следом */
export function frameTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#33200f';
  g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(${20 + Math.random() * 40},${12 + Math.random() * 22},6,0.35)`;
    g.lineWidth = 1 + Math.random() * 4;
    const y = Math.random() * 256;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(300, y + 6, 700, y - 6, 1024, y + 3);
    g.stroke();
  }
  // латунная полоса
  g.fillStyle = '#8a6a2f';
  g.fillRect(0, 10, 1024, 6);
  g.fillRect(0, 240, 1024, 6);
  // кошачий след — чередующиеся лапки
  for (let i = 0; i < 12; i++) {
    const x = 60 + i * 82;
    const y = 128 + (i % 2 === 0 ? -18 : 18);
    drawPaw(g, x, y, 16, '#c9a55a', 0.75);
  }
  return toTex(c, 3, 1);
}

/** Текстура фишки: верх с гравировкой подушечки */
export function checkerTopTexture(dark: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const base = dark ? '#241d20' : '#e9dcc8';
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // каёмка
  g.strokeStyle = dark ? '#c9a55a' : '#7a5c3a';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(128, 128, 116, 0, Math.PI * 2);
  g.stroke();
  // гравировка лапы по центру
  drawPaw(g, 128, 118, 42, dark ? 'rgba(201,165,90,0.75)' : 'rgba(122,92,58,0.7)');
  return toTex(c);
}

/** Грань кубика: слоновая кость, точки-отпечатки */
export function diceFaceTexture(value: number): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 95);
  grad.addColorStop(0, '#f3ead8');
  grad.addColorStop(1, '#d9c9ab');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // кайма
  g.strokeStyle = 'rgba(90,60,30,0.55)';
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(7, 7, 114, 114, 18);
  g.stroke();
  const pip = (x: number, y: number) => {
    drawPaw(g, x, y, 13, '#3a2415');
  };
  const C = 64, O = 32;
  switch (value) {
    case 1: pip(C, C); break;
    case 2: pip(C - O, C - O); pip(C + O, C + O); break;
    case 3: pip(C - O, C - O); pip(C, C); pip(C + O, C + O); break;
    case 4: pip(C - O, C - O); pip(C - O, C + O); pip(C + O, C - O); pip(C + O, C + O); break;
    case 5: pip(C - O, C - O); pip(C - O, C + O); pip(C, C); pip(C + O, C - O); pip(C + O, C + O); break;
    case 6: pip(C - O, C - O); pip(C - O, C); pip(C - O, C + O); pip(C + O, C - O); pip(C + O, C); pip(C + O, C + O); break;
  }
  return toTex(c);
}
