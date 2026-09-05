import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cardImage, getCard, type Deck, type Drawn, type Lang, type Position } from './data';
export function backTexture(){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=896;const c=canvas.getContext('2d')!;
 c.fillStyle='#18221e';c.fillRect(0,0,512,896);
 const wash=c.createRadialGradient(256,410,20,256,440,500);wash.addColorStop(0,'#27352b');wash.addColorStop(1,'#101915');c.fillStyle=wash;c.fillRect(0,0,512,896);
 c.strokeStyle='#aa8d51';c.lineWidth=2;c.strokeRect(17,17,478,862);c.strokeRect(27,27,458,842);c.strokeRect(42,42,428,812);
 c.globalAlpha=.4;c.lineWidth=1;
 for(let i=0;i<10;i++){c.beginPath();c.moveTo(42+i*18,42);c.lineTo(256,285+i*9);c.lineTo(470-i*18,42);c.stroke();c.beginPath();c.moveTo(42+i*18,854);c.lineTo(256,611-i*9);c.lineTo(470-i*18,854);c.stroke();}
 c.globalAlpha=.7;for(let i=0;i<4;i++){c.beginPath();c.moveTo(256,112+i*30);c.lineTo(452-i*18,448);c.lineTo(256,784-i*30);c.lineTo(60+i*18,448);c.closePath();c.stroke();}
 c.globalAlpha=1;c.fillStyle='#17231d';c.beginPath();c.arc(256,448,101,0,Math.PI*2);c.fill();c.stroke();
 for(let i=0;i<48;i++){const a=i/48*Math.PI*2;c.beginPath();c.moveTo(256+Math.cos(a)*111,448+Math.sin(a)*111);c.lineTo(256+Math.cos(a)*(i%2?129:147),448+Math.sin(a)*(i%2?129:147));c.stroke();}
 c.lineWidth=2.5;c.beginPath();c.moveTo(175,448);c.quadraticCurveTo(256,358,337,448);c.quadraticCurveTo(256,538,175,448);c.stroke();c.beginPath();c.arc(256,448,33,0,Math.PI*2);c.stroke();c.fillStyle='#c5aa6e';c.beginPath();c.arc(256,448,12,0,Math.PI*2);c.fill();
 for(const y of [77,819]){c.beginPath();c.moveTo(256,y-12);c.lineTo(264,y);c.lineTo(256,y+12);c.lineTo(248,y);c.closePath();c.fill();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function layout(count:number):[number,number,number?][] {
 if(count===1)return [[0,0]];
 if(count===3)return [[-2.55,0],[0,0],[2.55,0]];
 if(count===5)return [[-4.3,0],[-2.15,0],[0,0],[2.15,0],[4.3,0]];
 return [[-1.3,0],[-1.3,0,Math.PI/2],[-1.3,-3.6],[-3.8,0],[-1.3,3.6],[1.2,0],[4,-5.1],[4,-1.7],[4,1.7],[4,5.1]];
}
type Props={deck:Deck;drawn:Drawn[];revealed:boolean[];positions:Position[];lang:Lang;onFlip:(i:number)=>void;selected:number;readingKey:number};
export default function CardTable({deck,drawn,revealed,positions,lang,onFlip,selected,readingKey}:Props){
 const host=useRef<HTMLDivElement>(null);const state=useRef({revealed,selected});state.current={revealed,selected};const [failed,setFailed]=useState(false);const [errors,setErrors]=useState<number[]>([]);const [boxes,setBoxes]=useState<{x:number;y:number;w:number;h:number}[]>([]);const hover=useRef(-1);
 useEffect(()=>{if(!host.current)return;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{setFailed(true);return;}
 setFailed(false);setErrors([]);let alive=true;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);host.current.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
 const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-5,5,3,-3,.1,100);camera.position.z=20;const back=backTexture();const loader=new THREE.TextureLoader();const textures:THREE.Texture[]=[back];const mats:THREE.Material[]=[];const geometries:THREE.BufferGeometry[]=[];
 scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xf9dfa5,3);light.position.set(-4,6,8);scene.add(light);
 const coords=layout(positions.length);const groups=coords.map(([x,y,angle],i)=>{
 const group=new THREE.Group();group.position.set(x,y,angle?.18:0);group.rotation.z=angle||0;group.rotation.y=state.current.revealed[i]?Math.PI:0;scene.add(group);
 const bodyGeo=new THREE.BoxGeometry(1.76,3.06,.045);geometries.push(bodyGeo);const bodyMat=new THREE.MeshStandardMaterial({color:0xb8a16c,metalness:.7,roughness:.32});mats.push(bodyMat);group.add(new THREE.Mesh(bodyGeo,bodyMat));
 const plane=new THREE.PlaneGeometry(1.70,3);geometries.push(plane);const backMat=new THREE.MeshBasicMaterial({map:back});mats.push(backMat);const backMesh=new THREE.Mesh(plane,backMat);backMesh.position.z=.028;group.add(backMesh);
 const frontMat=new THREE.MeshBasicMaterial({color:0xd7c8a1});mats.push(frontMat);const front=new THREE.Mesh(plane,frontMat);front.position.z=-.028;front.rotation.y=Math.PI;if(drawn[i]?.reversed)front.rotation.z=Math.PI;group.add(front);
 if(drawn[i]){const tex=loader.load(cardImage(deck,drawn[i]!.id),t=>{if(!alive){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;frontMat.map=t;frontMat.color.set(0xffffff);frontMat.needsUpdate=true;},undefined,()=>{if(alive)setErrors(e=>[...e,i]);});textures.push(tex);}
 return group;});
 const stars=new THREE.BufferGeometry();const vertices=[];for(let i=0;i<100;i++)vertices.push((Math.random()-.5)*20,(Math.random()-.5)*15,-2-Math.random()*3);stars.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const starMat=new THREE.PointsMaterial({color:0xd7b66f,size:.025,transparent:true,opacity:.42});scene.add(new THREE.Points(stars,starMat));geometries.push(stars);mats.push(starMat);
 const resize=()=>{if(!host.current)return;const {width,height}=host.current.getBoundingClientRect();if(!width||!height)return;const aspect=width/height;const viewWidth=positions.length===5?11:positions.length===10?10:positions.length===1?4.7:8.8;const viewHeight=Math.max(positions.length===10?15:4.35,viewWidth/aspect);camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();renderer.setSize(width,height);setBoxes(coords.map(([x,y,a])=>({x:(x-camera.left)/(camera.right-camera.left)*100,y:(camera.top-y)/viewHeight*100,w:(a?3.06:1.76)/(camera.right-camera.left)*100,h:(a?1.76:3.06)/viewHeight*100})));};
 const observer=new ResizeObserver(resize);observer.observe(host.current);resize();let frame=0;const start=performance.now();let last=start;
 const animate=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now;const t=(now-start)/1000;groups.forEach((g,i)=>{const target=state.current.revealed[i]?Math.PI:0;const amount=reduced?1:1-Math.exp(-dt*7);g.rotation.y+=(target-g.rotation.y)*amount;const over=hover.current===i;g.rotation.x+=((over&&!reduced?-.07:0)-g.rotation.x)*amount;g.position.z+=( ((coords[i]![2]?.18:0)+(over?.28:0)+(reduced?0:Math.sin(g.rotation.y)*.7))-g.position.z)*amount;const entry=reduced?1:Math.min(1,Math.max(0,(t-i*.07)/.8));const ease=1-Math.pow(1-entry,3);g.position.x=coords[i]![0]*ease;g.scale.setScalar(.9+.1*ease);g.position.y=coords[i]![1]!+(1-ease)*.5+(reduced||positions.length===10?0:Math.sin(t*.65+i*1.8)*.045);});renderer.render(scene,camera);frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);
 const lost=(e:Event)=>{e.preventDefault();cancelAnimationFrame(frame);setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',lost);
 return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();renderer.domElement.remove();};
 },[deck.id,drawn,positions.length,readingKey]);
 if(failed)return <div className="fallback-cards">{positions.map((p,i)=><button key={i} className={`fallback-card ${revealed[i]?'turned':''}`} onClick={()=>onFlip(i)}><span>{revealed[i]&&drawn[i]?<img src={cardImage(deck,drawn[i]!.id)} alt={getCard(drawn[i]!.id,deck).name[lang]} style={{transform:drawn[i]!.reversed?'rotate(180deg)':undefined}}/>:<span className="fallback-back">✧</span>}</span><small>{i+1} · {p.name[lang]}</small></button>)}</div>;
 return <div ref={host} className={`card-table count-${positions.length}`}>
 {boxes.slice(0, positions.length).map((box,i)=><button key={i} className={`card-hit ${selected===i&&revealed[i]?'selected':''}`} style={{left:`${box.x}%`,top:`${box.y}%`,width:`${box.w}%`,height:`${box.h}%`,zIndex:i===1&&positions.length===10?3:2}} aria-pressed={!!revealed[i]} onClick={()=>onFlip(i)} onMouseEnter={()=>hover.current=i} onMouseLeave={()=>hover.current=-1} onFocus={()=>hover.current=i} onBlur={()=>hover.current=-1} aria-label={`${revealed[i]?(lang==='en'?'Turn over':'Dar la vuelta'):(lang==='en'?'Reveal':'Revelar')} ${i+1}: ${positions[i]!.name[lang]}${revealed[i]&&drawn[i]?`, ${getCard(drawn[i]!.id,deck).name[lang]}`:''}`}>
 <span className="card-index">{String(i+1).padStart(2,'0')}</span>{positions.length<10&&<span className="card-position">{positions[i]!.name[lang]}<small>{revealed[i]&&drawn[i]?getCard(drawn[i]!.id,deck).name[lang]:(lang==='en'?'Touch to reveal':'Toca para revelar')}</small></span>}{errors.includes(i)&&revealed[i]&&<span className="image-error">{getCard(drawn[i]!.id,deck).name[lang]}<small>{lang==='en'?'Image unavailable':'Imagen no disponible'}</small></span>}
 </button>)}
 </div>;
}
