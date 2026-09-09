import type {Point,Annotation} from './project';
export class Camera {
  x=0;y=0;scale=1;
  constructor(public width=1024,public height=1024){}
  fit(vw:number,vh:number){this.scale=Math.min((vw-96)/this.width,(vh-96)/this.height);this.x=(vw-this.width*this.scale)/2;this.y=(vh-this.height*this.scale)/2;}
  toProject(p:Point):Point{return {x:(p.x-this.x)/(this.width*this.scale),y:(p.y-this.y)/(this.height*this.scale)};}
  toScreen(p:Point):Point{return {x:this.x+p.x*this.width*this.scale,y:this.y+p.y*this.height*this.scale};}
  zoom(factor:number,p:Point){const q=this.toProject(p);this.scale=Math.min(8,Math.max(.05,this.scale*factor));this.x=p.x-q.x*this.width*this.scale;this.y=p.y-q.y*this.height*this.scale;}
  pan(dx:number,dy:number){this.x+=dx;this.y+=dy;}
}
export const clamp=(p:Point)=>({x:Math.min(1,Math.max(0,p.x)),y:Math.min(1,Math.max(0,p.y))});
export function bounds(a:Annotation){const xs=a.points.map(p=>p.x),ys=a.points.map(p=>p.y);return {x:Math.max(0,Math.min(...xs)-a.radius),y:Math.max(0,Math.min(...ys)-a.radius),right:Math.min(1,Math.max(...xs)+a.radius),bottom:Math.min(1,Math.max(...ys)+a.radius)};}
export function hit(a:Annotation,p:Point,tolerance=.02){return a.points.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<a.radius+tolerance);}
export function motion(a:Annotation){const first=a.points[0]!,last=a.points.at(-1)!;return {start:first,end:last,dx:last.x-first.x,dy:last.y-first.y};}
