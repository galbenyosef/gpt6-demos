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

const {useCardInspection}=await import('./CardInspection');

test('right-click zoom preserves the reading and dismisses on any key or click',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const flips:number[]=[];
 function InspectableTable(){
  const inspection=useCardInspection('es');
  return <><CardTable deck={deck} drawn={[{id:'fool',reversed:true}]} revealed={[true]} positions={spreads.find(s=>s.id==='daily')!.positions} lang="es" onFlip={i=>flips.push(i)} selected={0} readingKey={0} onInspect={(e)=>inspection.openMenu(e,{image:'/decks/test/fool.jpg',name:'El Loco',reversed:true})}/>{inspection.overlay}</>;
 }
 try{
  await act(async()=>root.render(<InspectableTable/>));
  const card=host.querySelector('.card-hit') as HTMLButtonElement;
  const open=async()=>{
   await act(async()=>{card.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:880,clientY:390}) as unknown as Event);});
   const option=host.querySelector('[role="menuitem"]') as HTMLButtonElement;
   expect(option.textContent).toContain('Ampliar carta');
   await act(async()=>option.click());
   const popup=host.querySelector('dialog')!;
   expect(popup.hasAttribute('open')).toBe(true);
   expect(popup.querySelector('img')!.getAttribute('src')).toBe('/decks/test/fool.jpg');
   expect(popup.querySelector('img')!.style.transform).toBe('rotate(180deg)');
   expect(flips).toEqual([]);
   return popup;
  };
  await open();
  expect(document.body.style.overflow).toBe('hidden');
  await act(async()=>{document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'q',bubbles:true,cancelable:true}) as unknown as Event);});
  expect(host.querySelector('dialog')).toBeNull();expect(document.activeElement).toBe(card);expect(document.body.style.overflow).toBe('');
  const popup=await open();
  await act(async()=>popup.querySelector('img')!.click());
  expect(host.querySelector('dialog')).toBeNull();expect(flips).toEqual([]);
  await act(async()=>{card.dispatchEvent(new window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}) as unknown as Event);});
  expect(host.querySelector('[role="menu"]')).not.toBeNull();
  await act(async()=>{document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}) as unknown as Event);});
  expect(host.querySelector('[role="menu"]')).toBeNull();expect(document.activeElement).toBe(card);
 }finally{await act(async()=>root.unmount());host.remove();}
});
