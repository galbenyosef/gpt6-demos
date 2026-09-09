import {Camera,clamp,hit} from './geometry';
import {annotations,id,revision,type Annotation,type Point,type Project,type Tool} from './project';
import {BitmapCache} from './storage';
export function drawAnnotation(ctx:CanvasRenderingContext2D,a:Annotation,w:number,h:number,mask=false){
  if(!a.points.length)return;const start=a.points[0]!,end=a.points.at(-1)!;
  ctx.save();ctx.strokeStyle=mask?'#000':a.color;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=Math.max(1,a.radius*w*2);ctx.lineCap='round';ctx.lineJoin='round';
  if(a.kind==='select'||a.kind==='crop'){ctx.lineWidth=2;ctx.setLineDash([7,5]);if(mask)ctx.fillRect(start.x*w,start.y*h,(end.x-start.x)*w,(end.y-start.y)*h);else{ctx.strokeRect(start.x*w,start.y*h,(end.x-start.x)*w,(end.y-start.y)*h);ctx.fillStyle='#d8ed7133';ctx.fillRect(start.x*w,start.y*h,(end.x-start.x)*w,(end.y-start.y)*h);}}
  else if(a.kind==='comment'){ctx.beginPath();ctx.arc(start.x*w,start.y*h,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#20231d';ctx.font='bold 13px sans-serif';ctx.fillText('!',start.x*w-2,start.y*h+5);if(a.text){ctx.font='14px sans-serif';const text=a.text.slice(0,70);const tw=ctx.measureText(text).width;const x=Math.min(start.x*w+20,w-tw-16);const y=Math.max(20,start.y*h);ctx.fillStyle='#f6f5ed';ctx.fillRect(x-6,y-17,tw+12,25);ctx.fillStyle='#20231d';ctx.fillText(text,x,y);}}
  else if(a.kind==='arrow'){ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(start.x*w,start.y*h);for(const p of a.points.slice(1))ctx.lineTo(p.x*w,p.y*h);ctx.stroke();const before=a.points[Math.max(0,a.points.length-2)]!;const angle=Math.atan2((end.y-before.y)*h,(end.x-before.x)*w);ctx.beginPath();ctx.moveTo(end.x*w,end.y*h);ctx.lineTo(end.x*w-18*Math.cos(angle-.5),end.y*h-18*Math.sin(angle-.5));ctx.moveTo(end.x*w,end.y*h);ctx.lineTo(end.x*w-18*Math.cos(angle+.5),end.y*h-18*Math.sin(angle+.5));ctx.stroke();}
  else {if(a.kind==='mask'&&!mask)ctx.globalAlpha=.38;ctx.beginPath();ctx.moveTo(start.x*w,start.y*h);for(const p of a.points.slice(1))ctx.lineTo(p.x*w,p.y*h);if(a.points.length===1)ctx.lineTo(start.x*w+.1,start.y*h);if(a.kind==='lasso'){ctx.closePath();if(mask)ctx.fill();else{ctx.fillStyle='#d8ed7133';ctx.fill();ctx.setLineDash([7,5]);ctx.lineWidth=2;ctx.stroke();}}else ctx.stroke();}
  ctx.restore();
}
export function blobFromCanvas(c:HTMLCanvasElement,type='image/png'):Promise<Blob>{return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not export image.')),type,.94));}
export class CanvasEngine{
  camera=new Camera();cache=new BitmapCache();tool:Tool='select';radius=.012;color='#c8e86b';onion='off';opacity=.35;showGuidance=true;
  private drag?:Annotation;private last?:Point;private down=false;private renderEpoch=0;private space=false;
  constructor(public canvas:HTMLCanvasElement,public project:()=>Project,public changed:()=>void,public annotate:(point:Point)=>void){
    new ResizeObserver(()=>this.resize()).observe(canvas.parentElement!);
    canvas.addEventListener('pointerdown',e=>this.start(e));canvas.addEventListener('pointermove',e=>this.move(e));canvas.addEventListener('pointerup',()=>this.end());canvas.addEventListener('pointercancel',()=>this.end());
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.camera.zoom(Math.exp(-e.deltaY*.001),this.local(e));void this.render();},{passive:false});
    window.addEventListener('keydown',e=>{if(e.code==='Space'&&!isTyping(e.target)&&!(e.target as HTMLElement).closest('.timeline')){this.space=true;e.preventDefault();}});window.addEventListener('keyup',e=>{if(e.code==='Space')this.space=false;});
  }
  local(e:MouseEvent){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  resize(){const r=this.canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.fit();}
  fit(){const p=this.project();this.camera.width=p.size.width;this.camera.height=p.size.height;this.camera.fit(this.canvas.clientWidth,this.canvas.clientHeight);void this.render();}
  start(e:PointerEvent){if(e.button!==0)return;this.canvas.setPointerCapture(e.pointerId);this.down=true;this.last=this.local(e);const point=clamp(this.camera.toProject(this.last));if(this.tool==='hand'||this.space)return;if(this.tool==='zoom'){this.camera.zoom(e.altKey?.8:1.25,this.last);void this.render();return;}if(this.tool==='comment'){this.annotate(point);return;}if(this.tool==='eraser'){this.erase(point);return;}
    if(['select','lasso','crop'].includes(this.tool)){const list=annotations(this.project());this.project().annotations[this.project().activeRevisionId??'draft']=list.filter(a=>!['select','lasso','crop'].includes(a.kind));}
    this.drag={id:id(),kind:this.tool,points:[point],radius:this.radius,color:this.color};annotations(this.project()).push(this.drag);void this.render();
  }
  move(e:PointerEvent){if(!this.down)return;const local=this.local(e),p=clamp(this.camera.toProject(local));if(this.tool==='hand'||this.space){this.camera.pan(local.x-this.last!.x,local.y-this.last!.y);}else if(this.tool==='eraser')this.erase(p);else if(this.drag){if(['select','crop'].includes(this.drag.kind))this.drag.points[1]=p;else this.drag.points.push(p);}this.last=local;void this.render();}
  erase(point:Point){const p=this.project();p.annotations[p.activeRevisionId??'draft']=annotations(p).filter(a=>!hit(a,point,this.radius));}
  end(){if(!this.down)return;this.down=false;this.drag=undefined;this.changed();}
  async render(){const epoch=++this.renderEpoch,p=this.project(),r=revision(p),ctx=this.canvas.getContext('2d')!;
    let bitmap:ImageBitmap|undefined;try{if(r)bitmap=await this.cache.get(r.imageAssetId);}catch{}if(epoch!==this.renderEpoch)return;
    const dpr=devicePixelRatio||1,w=this.canvas.clientWidth,h=this.canvas.clientHeight;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#dedfd8';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#c7c9c0';for(let x=12;x<w;x+=20)for(let y=12;y<h;y+=20)ctx.fillRect(x,y,1,1);
    const c=this.camera;ctx.save();ctx.translate(c.x,c.y);ctx.scale(c.scale,c.scale);ctx.shadowColor='#30372e20';ctx.shadowBlur=25;ctx.fillStyle='#f9f8f2';ctx.fillRect(0,0,p.size.width,p.size.height);ctx.shadowBlur=0;
    if(bitmap)ctx.drawImage(bitmap,0,0,p.size.width,p.size.height);
    if(p.mode==='ANIMATE'&&this.onion!=='off'){const idx=p.frames.findIndex(f=>f.id===p.activeFrameId);const offsets=this.onion==='both'?[-1,1]:this.onion==='previous'?[-1]:[1];for(const offset of offsets){const other=p.frames[idx+offset],rr=other&&revision(p,other.revisionId);if(rr){try{const b=await this.cache.get(rr.imageAssetId);if(epoch!==this.renderEpoch){ctx.restore();return;}ctx.globalAlpha=this.opacity;ctx.drawImage(b,0,0,p.size.width,p.size.height);ctx.globalAlpha=1;}catch{}}}}
    if(this.showGuidance)for(const a of annotations(p))drawAnnotation(ctx,a,p.size.width,p.size.height);
    if(!bitmap&&!annotations(p).length){ctx.textAlign='center';ctx.fillStyle='#adb4a0';ctx.font=`${p.size.width*.065}px Georgia`;ctx.fillText('A little idea.',p.size.width/2,p.size.height*.46);ctx.fillStyle='#333d2d';ctx.fillText('A world of possibility.',p.size.width/2,p.size.height*.54);ctx.font=`${p.size.width*.017}px sans-serif`;ctx.fillStyle='#747a6c';ctx.fillText('DESCRIBE IT, DROP AN IMAGE, OR DRAW SOMETHING.',p.size.width/2,p.size.height*.62);}
    ctx.restore();document.querySelector('#zoom-value')!.textContent=`${Math.round(c.scale*100)}%`;
  }
  async composite(rid=this.project().activeRevisionId,kind:'flatten'|'guidance'|'mask'='flatten',p=this.project()){
    const c=document.createElement('canvas');c.width=p.size.width;c.height=p.size.height;const ctx=c.getContext('2d')!;const r=revision(p,rid),list=p.annotations[rid??'draft']??[];
    if(kind==='mask'){ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.globalCompositeOperation='destination-out';for(const a of list.filter(a=>['mask','select','lasso'].includes(a.kind)))drawAnnotation(ctx,a,c.width,c.height,true);}
    else {ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);if(r)ctx.drawImage(await this.cache.get(r.imageAssetId),0,0,c.width,c.height);for(const a of list.filter(a=>kind==='guidance'||['brush','sketch'].includes(a.kind)))drawAnnotation(ctx,a,c.width,c.height);}
    return c;
  }
}
export function isTyping(target:EventTarget|null){return target instanceof HTMLElement&&(target.matches('input,textarea,select')||target.isContentEditable);}
