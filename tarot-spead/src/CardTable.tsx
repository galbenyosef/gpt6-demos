import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {createCardBack} from './cardBack';
import {themes, type Theme} from './themes';
import { cardImage, getCard, type Deck, type Drawn, type Lang, type Position } from './data';
export function backTexture(theme: Theme = 'forest'){
 const texture=new THREE.CanvasTexture(createCardBack(theme));texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

function layout(count:number):[number,number,number?][] {
 if(count===1)return [[0,0]];
 if(count===3)return [[-2.55,0],[0,0],[2.55,0]];
 if(count===5)return [[-4.3,0],[-2.15,0],[0,0],[2.15,0],[4.3,0]];
 return [[-1.3,0],[-1.3,0,Math.PI/2],[-1.3,-3.6],[-3.8,0],[-1.3,3.6],[1.2,0],[4,-5.1],[4,-1.7],[4,1.7],[4,5.1]];
}
type Props={deck:Deck;drawn:Drawn[];revealed:boolean[];positions:Position[];lang:Lang;onFlip:(i:number)=>void;selected:number;readingKey:number;theme?:Theme;onInspect?:(event:React.MouseEvent<HTMLElement>|React.KeyboardEvent<HTMLElement>,index:number)=>void};
export default function CardTable({deck,drawn,revealed,positions,lang,onFlip,selected,readingKey,theme='forest',onInspect}:Props){
 const host=useRef<HTMLDivElement>(null);const state=useRef({revealed,selected});state.current={revealed,selected};const [failed,setFailed]=useState(false);const [errors,setErrors]=useState<number[]>([]);const [boxes,setBoxes]=useState<{x:number;y:number;w:number;h:number}[]>([]);const hover=useRef(-1);
 useEffect(()=>{if(!host.current)return;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{setFailed(true);return;}
 setFailed(false);setErrors([]);let alive=true;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);host.current.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
 const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-5,5,3,-3,.1,100);camera.position.z=20;const back=backTexture(theme);const loader=new THREE.TextureLoader();const textures:THREE.Texture[]=[back];const mats:THREE.Material[]=[];const geometries:THREE.BufferGeometry[]=[];
 scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xf9dfa5,3);light.position.set(-4,6,8);scene.add(light);
 const coords=layout(positions.length);const groups=coords.map(([x,y,angle],i)=>{
 const group=new THREE.Group();group.position.set(x,y,angle?.18:0);group.rotation.z=angle||0;group.rotation.y=state.current.revealed[i]?Math.PI:0;scene.add(group);
 const bodyGeo=new THREE.BoxGeometry(1.76,3.06,.045);geometries.push(bodyGeo);const bodyMat=new THREE.MeshStandardMaterial({color:themes[theme].metal,metalness:.7,roughness:.32});mats.push(bodyMat);group.add(new THREE.Mesh(bodyGeo,bodyMat));
 const plane=new THREE.PlaneGeometry(1.70,3);geometries.push(plane);const backMat=new THREE.MeshBasicMaterial({map:back});mats.push(backMat);const backMesh=new THREE.Mesh(plane,backMat);backMesh.position.z=.028;group.add(backMesh);
 const frontMat=new THREE.MeshBasicMaterial({color:0xd7c8a1});mats.push(frontMat);const front=new THREE.Mesh(plane,frontMat);front.position.z=-.028;front.rotation.y=Math.PI;if(drawn[i]?.reversed)front.rotation.z=Math.PI;group.add(front);
 if(drawn[i]){const tex=loader.load(cardImage(deck,drawn[i]!.id),t=>{if(!alive){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;frontMat.map=t;frontMat.color.set(0xffffff);frontMat.needsUpdate=true;},undefined,()=>{if(alive)setErrors(e=>[...e,i]);});textures.push(tex);}
 return group;});
 const stars=new THREE.BufferGeometry();const vertices=[];for(let i=0;i<100;i++)vertices.push((Math.random()-.5)*20,(Math.random()-.5)*15,-2-Math.random()*3);stars.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const starMat=new THREE.PointsMaterial({color:themes[theme].accent,size:.025,transparent:true,opacity:.42});scene.add(new THREE.Points(stars,starMat));geometries.push(stars);mats.push(starMat);
 const resize=()=>{if(!host.current)return;const {width,height}=host.current.getBoundingClientRect();if(!width||!height)return;const aspect=width/height;const viewWidth=positions.length===5?11:positions.length===10?10:positions.length===1?4.7:8.8;const viewHeight=Math.max(positions.length===10?15:4.35,viewWidth/aspect);camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();renderer.setSize(width,height);setBoxes(coords.map(([x,y,a])=>({x:(x-camera.left)/(camera.right-camera.left)*100,y:(camera.top-y)/viewHeight*100,w:(a?3.06:1.76)/(camera.right-camera.left)*100,h:(a?1.76:3.06)/viewHeight*100})));};
 const observer=new ResizeObserver(resize);observer.observe(host.current);resize();let frame=0;const start=performance.now();let last=start;
 const animate=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now;const t=(now-start)/1000;groups.forEach((g,i)=>{const target=state.current.revealed[i]?Math.PI:0;const amount=reduced?1:1-Math.exp(-dt*7);g.rotation.y+=(target-g.rotation.y)*amount;const over=hover.current===i;g.rotation.x+=((over&&!reduced?-.07:0)-g.rotation.x)*amount;g.position.z+=( ((coords[i]![2]?.18:0)+(over?.28:0)+(reduced?0:Math.sin(g.rotation.y)*.7))-g.position.z)*amount;const entry=reduced?1:Math.min(1,Math.max(0,(t-i*.07)/.8));const ease=1-Math.pow(1-entry,3);g.position.x=coords[i]![0]*ease;g.scale.setScalar(.9+.1*ease);g.position.y=coords[i]![1]!+(1-ease)*.5+(reduced||positions.length===10?0:Math.sin(t*.65+i*1.8)*.045);});renderer.render(scene,camera);frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);
 const lost=(e:Event)=>{e.preventDefault();cancelAnimationFrame(frame);setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',lost);
 return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();renderer.domElement.remove();};
 },[deck.id,drawn,positions.length,readingKey,theme]);
 if(failed)return <div className="fallback-cards">{positions.map((p,i)=><button key={i} className={`fallback-card ${revealed[i]?'turned':''}`} onContextMenu={onInspect?e=>onInspect(e,i):undefined} onKeyDown={onInspect?e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))onInspect(e,i)}:undefined} aria-haspopup={onInspect?"menu":undefined} onClick={()=>onFlip(i)}><span>{revealed[i]&&drawn[i]?<img src={cardImage(deck,drawn[i]!.id)} alt={getCard(drawn[i]!.id,deck).name[lang]} style={{transform:drawn[i]!.reversed?'rotate(180deg)':undefined}}/>:<span className="fallback-back">✧</span>}</span><small>{i+1} · {p.name[lang]}</small></button>)}</div>;
 return <div ref={host} className={`card-table count-${positions.length}`}>
 {boxes.slice(0, positions.length).map((box,i)=><button key={i} className={`card-hit ${selected===i&&revealed[i]?'selected':''}`} style={{left:`${box.x}%`,top:`${box.y}%`,width:`${box.w}%`,height:`${box.h}%`,zIndex:i===1&&positions.length===10?3:2}} aria-pressed={!!revealed[i]} onContextMenu={onInspect?e=>onInspect(e,i):undefined} onKeyDown={onInspect?e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))onInspect(e,i)}:undefined} aria-haspopup={onInspect?"menu":undefined} onClick={()=>onFlip(i)} onMouseEnter={()=>hover.current=i} onMouseLeave={()=>hover.current=-1} onFocus={()=>hover.current=i} onBlur={()=>hover.current=-1} aria-label={`${revealed[i]?(lang==='en'?'Turn over':'Dar la vuelta'):(lang==='en'?'Reveal':'Revelar')} ${i+1}: ${positions[i]!.name[lang]}${revealed[i]&&drawn[i]?`, ${getCard(drawn[i]!.id,deck).name[lang]}`:''}`}>
 <span className="card-index">{String(i+1).padStart(2,'0')}</span>{positions.length<10&&<span className="card-position">{positions[i]!.name[lang]}<small>{revealed[i]&&drawn[i]?getCard(drawn[i]!.id,deck).name[lang]:(lang==='en'?'Touch to reveal':'Toca para revelar')}</small></span>}{errors.includes(i)&&revealed[i]&&<span className="image-error">{getCard(drawn[i]!.id,deck).name[lang]}<small>{lang==='en'?'Image unavailable':'Imagen no disponible'}</small></span>}
 </button>)}
 </div>;
}
