// Adapted from ABYSSAL — The Living Deep, ae30cdd1746e0fda2f01ccd2a4dd4cee047169a4.
// ReefGeometry.js and WorldMath.js. See the adjacent MIT LICENSE.txt.
import * as THREE from 'three';
const up = new THREE.Vector3(0,1,0);
const TAU = Math.PI*2;
export function seeded(seed = 73129) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function segment(a, b, radiusA, radiusB, sides = 6) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(radiusB, radiusA, delta.length(), sides, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
  g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

export function rockGeometry(seed = 1) {
  const g = new THREE.SphereGeometry(1, 22, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + Math.sin(x * 3.9 + seed) * Math.sin(y * 3.1 + 3.0) * Math.cos(z * 4.2) * .18
      + Math.sin(x * 12.3 + z * 8.1 + seed) * Math.sin(y * 10.7) * .075
      + Math.sin(x * 27.1 + y * 18.4) * Math.cos(z * 23.7 + seed) * .022;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  g.computeVertexNormals(); return g;
}
export function growBranchCoral(batch, x, y, z, size, color, rng, fan = false, levels = 4) {
  const origin = new THREE.Vector3(x, y, z);
  const angle = rng() * TAU;
  const recurse = (start, dir, length, radius, level) => {
    const end = start.clone().addScaledVector(dir, length);
    const mid=start.clone().lerp(end,.52).add(new THREE.Vector3((rng()-.5)*length*.10,0,(rng()-.5)*length*.10));
    const curve=new THREE.CatmullRomCurve3([start,mid,end]);
    const sides=radius>.013?7:5,steps=radius>.02?4:3;
    const branch=new THREE.TubeGeometry(curve,steps,radius,sides,false),bp=branch.attributes.position;
    for(let i=0;i<bp.count;i++){
      const row=Math.floor(i/(sides+1)),t=row/steps,c=curve.getPointAt(t),taper=1-t*.48;
      bp.setXYZ(i,c.x+(bp.getX(i)-c.x)*taper,c.y+(bp.getY(i)-c.y)*taper,c.z+(bp.getZ(i)-c.z)*taper);
    }
    branch.computeVertexNormals();batch.add(branch,color,rng);
    if (level <= 0) {
      const tip = end.clone().addScaledVector(dir, length * 0.12);
      batch.add(segment(end, tip, radius * 0.54, radius * 0.18, 7), '#c2bba2', rng);
      return;
    }
    const forks = level > 1 ? 3 : 2;
    for (let j = 0; j < forks; j++) {
      let nd;
      if (fan) {
        const a = (rng() - 0.5) * 1.8;
        nd = new THREE.Vector3(Math.sin(angle) * a, 0.5 + rng() * 0.6, Math.cos(angle) * a);
      } else nd = new THREE.Vector3((rng() - 0.5) * 1.5, 0.5 + rng() * 0.7, (rng() - 0.5) * 1.5);
      nd.addScaledVector(dir, 0.5).normalize();
      recurse(end, nd, length * (0.63 + rng() * 0.1), radius * (fan?.60:.69), level - 1);
    }
  };
  const crown=origin.clone().add(new THREE.Vector3(0,size*0.12,0));
  batch.add(segment(origin,crown,size*0.07,size*0.05,7),color,rng);
  const trunks=fan?3:size>1.8?4:3;
  for(let j=0;j<trunks;j++) {
    const a=angle+j/trunks*TAU;
    const dir=fan?new THREE.Vector3(Math.sin(angle)*(j-1)*0.8,1,Math.cos(angle)*(j-1)*0.8):new THREE.Vector3(Math.cos(a)*0.55,0.7+rng()*0.35,Math.sin(a)*0.55);
    recurse(crown,dir.normalize(),size*(fan?.28:.27),size*(fan?.025:.041),levels);
  }
}

export function plateGeometry(radius, wobble = 0) {
  const p = [], uv = [], idx = []; const rings = 8, sides = 40;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) {
    const a = i / sides * TAU, r = j / rings;
    const rr = radius * r * (1.0 + Math.sin(a * 5 + wobble) * r * .15 + Math.sin(a*11+wobble)*r*.045);
    p.push(Math.cos(a) * rr, r*r*radius*.10+Math.sin(a*5+wobble)*radius*r*.05+Math.sin(r*14+a*3)*r*.014,Math.sin(a)*rr);
    uv.push(r, a / TAU);
    if (j < rings && i < sides) { const n = j * (sides + 1) + i; idx.push(n, n + sides + 1, n + 1, n + 1, n + sides + 1, n + sides + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function leafGeometry(start, end, width, twist, bend = 0.25) {
  const p = [], uv = [], idx = [], dir = new THREE.Vector3().subVectors(end, start);
  const side = new THREE.Vector3(Math.cos(twist), 0.1, Math.sin(twist));
  const rows = 10, cols = 4;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const t = j / rows, s = i / cols * 2 - 1;
    const w = Math.pow(Math.sin(t * Math.PI), 0.65) * width;
    const v = start.clone().addScaledVector(dir, t).addScaledVector(side, s * w);
    v.y += Math.sin(t * Math.PI) * bend + Math.abs(s) * w * 0.2 + Math.sin(t * 18 + s * 2) * w * 0.13;
    p.push(v.x, v.y, v.z); uv.push(i / cols, t);
    if (i < cols && j < rows) { const n = j * (cols + 1) + i; idx.push(n, n + 1, n + cols + 1, n + 1, n + cols + 2, n + cols + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function addKelp(batch, x, y, z, height, rng, small = false) {
  const phase = rng() * TAU;
  const at=t=>new THREE.Vector3(x+Math.sin(t*4+phase)*t*.9+Math.sin(phase)*t*t*t*height*.24,y+t*height,z+Math.cos(t*3+phase)*t*.9+Math.cos(phase)*t*t*t*height*.19);
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 20 }, (_, i) => at(i / 19)));
  const flex = (px, py) => Math.pow(Math.max(0, py - y) / height, 1.4) * (small ? .22 : 1.10);
  batch.add(new THREE.TubeGeometry(path, 25, small ? .012 : .030, 7, false), '#53533a', rng, flex);
  const count=small?9:Math.floor(height*1.65);
  for (let j = 1; j < count; j++) {
    const t=(j+Math.sin(j*2.3)*.22)/count,a=j*2.39996+phase+(rng()-.5)*.28;
    const start = at(t), length = (small ? .25 : .65) + rng() * (small ? .50 : 1.05);
    const end = start.clone().add(new THREE.Vector3(Math.cos(a) * length, -length * 0.7 + rng() * 0.55, Math.sin(a) * length));
    const color = new THREE.Color().setHSL(.125+rng()*.03,.30+rng()*.19,.19+rng()*.095);
    batch.add(leafGeometry(start, end, length * 0.095, a + Math.PI / 2, length * 0.38), color, rng, flex);
    if(!small){const bladder=new THREE.SphereGeometry(.050+rng()*.015,7,5);bladder.scale(1,1.4,1);bladder.translate(start.x,start.y,start.z);batch.add(bladder,'#71633d',rng,flex);}
  }
}
