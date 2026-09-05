import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildEuropa, type ArchitectureContext } from './architecture';

test('architectural meshes have finite geometry and every material batch can render after merging', () => {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const mat: ArchitectureContext['mat'] = (color, roughness=.8, metalness=0) => new THREE.MeshStandardMaterial({color, roughness, metalness});
  const put: ArchitectureContext['put'] = (g,m,x=0,y=0,z=0,ry=0) => {
    g.rotateY(ry);g.translate(x,y,z);
    const position=g.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    if(!batches.has(m))batches.set(m,[]);
    batches.get(m)!.push(g);
  };
  buildEuropa({
    put,mat,
    box:(w,h,d,x,y,z,m,ry=0)=>put(new THREE.BoxGeometry(w,h,d),m,x,y,z,ry),
    cylinder:(rt,rb,h,x,y,z,m,segments=24)=>put(new THREE.CylinderGeometry(rt,rb,h,segments),m,x,y,z),
    rod:(a,b,r,m)=>{
      const g=new THREE.CylinderGeometry(r,r,a.distanceTo(b),6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));
      const center=a.clone().add(b).multiplyScalar(.5);put(g,m,center.x,center.y,center.z);
    },
    granite:mat('#3e4546'),edgeStone:mat('#535d5e'),dark:mat('#171f22'),aluminum:mat('#303f43'),brass:mat('#c4ab67'),
    pavement:mat('#cccbc0'),curb:mat('#dddcd0'),grass:mat('#617f42'),glow:mat('#dfcd94'),glassMaterials:Array.from({length:8},()=>mat('#819aa9')),
    makeSignTexture:()=>new THREE.Texture(),
  });
  const bounds=new THREE.Box3();
  for(const [material,geometries] of batches){
    const merged=mergeGeometries(geometries,false);
    expect(merged).not.toBeNull();
    merged!.computeBoundingBox();bounds.union(merged!.boundingBox!);
    geometries.forEach(g=>g.dispose());merged!.dispose();material.dispose();
  }
  // Catch accidental world-coordinate placement or a roof/entrance below the ground.
  expect(bounds.min.y).toBeGreaterThanOrEqual(.6);
  expect(bounds.max.y).toBeLessThan(55);
  expect(bounds.min.x).toBeGreaterThan(-40);
  expect(bounds.max.x).toBeLessThan(35);
  expect(bounds.min.z).toBeGreaterThan(-15);
  expect(bounds.max.z).toBeLessThan(16);
});
