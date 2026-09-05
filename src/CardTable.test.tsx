import {test,expect,mock} from 'bun:test';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import * as THREE from 'three';
import {cards,spreads,type Deck} from './data';
// A component lifecycle test: no GPU or browser automation is needed.
const window=new Window();
Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,devicePixelRatio:1,matchMedia:()=>({matches:true}),requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},ResizeObserver:class{constructor(private cb:()=>void){}observe(){this.cb()}disconnect(){}}});
window.HTMLElement.prototype.getBoundingClientRect=()=>new window.DOMRect(0,0,900,400);
const ctx=new Proxy({},{get:(_target,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
window.HTMLCanvasElement.prototype.getContext=(()=>ctx) as any;
let disposals=0;
class FakeRenderer{domElement=document.createElement('canvas');setPixelRatio(){}setClearColor(){}setSize(){}render(){}dispose(){disposals++}}
class FakeTextureLoader{load(_url:string,onLoad:(texture:THREE.Texture)=>void){const texture=new THREE.Texture();onLoad(texture);return texture;}}
mock.module('three',()=>({...THREE,WebGLRenderer:FakeRenderer,TextureLoader:FakeTextureLoader}));
const {createRoot}=await import('react-dom/client');
const {default:CardTable}=await import('./CardTable');
const deck:Deck={id:'test',name:{en:'Test',es:'Prueba'},description:{en:'Test',es:'Prueba'},files:Object.fromEntries(cards.map(c=>[c.id,`${c.id}.jpg`]))};
test('switching from larger spreads to Daily Reflection clears stale card hit areas',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const clicks:number[]=[];
 try{
  for(const id of ['three','daily','path','three','celtic','daily','celtic','path','daily']){
   const spread=spreads.find(s=>s.id===id)!;const drawn=cards.slice(0,spread.positions.length).map(c=>({id:c.id,reversed:false}));
   await act(async()=>root.render(<CardTable deck={deck} drawn={drawn} revealed={drawn.map(()=>false)} positions={spread.positions} lang="en" onFlip={i=>clicks.push(i)} selected={0} readingKey={0}/>));
   expect(host.querySelectorAll('.card-hit')).toHaveLength(spread.positions.length);
   expect(host.querySelectorAll('canvas')).toHaveLength(1);
   expect(host.querySelector('button')!.getAttribute('aria-label')).toContain(spread.positions[0]!.name.en);
  }
  await act(async()=>{(host.querySelector('button') as HTMLButtonElement).click()});expect(clicks).toEqual([0]);
  const daily=spreads.find(s=>s.id==='daily')!;
  await act(async()=>root.render(<CardTable deck={deck} drawn={[{id:'fool',reversed:true}]} revealed={[true]} positions={daily.positions} lang="es" onFlip={i=>clicks.push(i)} selected={0} readingKey={1}/>));
  expect(host.querySelector('button')!.getAttribute('aria-label')).toContain('El Loco');
  expect(host.querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
 }finally{await act(async()=>root.unmount());host.remove();}
 expect(disposals).toBeGreaterThanOrEqual(9);
});
