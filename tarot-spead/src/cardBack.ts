import {themes, type Theme} from './themes';
export function createCardBack(theme: Theme = 'forest'){
 const palette = themes[theme];
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=896;const c=canvas.getContext('2d')!;
 c.fillStyle=palette.back;c.fillRect(0,0,512,896);
 const wash=c.createRadialGradient(256,410,20,256,440,500);wash.addColorStop(0,palette.glow);wash.addColorStop(1,palette.ink);c.fillStyle=wash;c.fillRect(0,0,512,896);
 c.strokeStyle=palette.line;c.lineWidth=2;c.strokeRect(17,17,478,862);c.strokeRect(27,27,458,842);c.strokeRect(42,42,428,812);
 c.globalAlpha=.4;c.lineWidth=1;
 for(let i=0;i<10;i++){c.beginPath();c.moveTo(42+i*18,42);c.lineTo(256,285+i*9);c.lineTo(470-i*18,42);c.stroke();c.beginPath();c.moveTo(42+i*18,854);c.lineTo(256,611-i*9);c.lineTo(470-i*18,854);c.stroke();}
 c.globalAlpha=.7;for(let i=0;i<4;i++){c.beginPath();c.moveTo(256,112+i*30);c.lineTo(452-i*18,448);c.lineTo(256,784-i*30);c.lineTo(60+i*18,448);c.closePath();c.stroke();}
 c.globalAlpha=1;c.fillStyle=palette.seal;c.beginPath();c.arc(256,448,101,0,Math.PI*2);c.fill();c.stroke();
 for(let i=0;i<48;i++){const a=i/48*Math.PI*2;c.beginPath();c.moveTo(256+Math.cos(a)*111,448+Math.sin(a)*111);c.lineTo(256+Math.cos(a)*(i%2?129:147),448+Math.sin(a)*(i%2?129:147));c.stroke();}
 c.lineWidth=2.5;c.beginPath();c.moveTo(175,448);c.quadraticCurveTo(256,358,337,448);c.quadraticCurveTo(256,538,175,448);c.stroke();c.beginPath();c.arc(256,448,33,0,Math.PI*2);c.stroke();c.fillStyle=palette.accent;c.beginPath();c.arc(256,448,12,0,Math.PI*2);c.fill();
 for(const y of [77,819]){c.beginPath();c.moveTo(256,y-12);c.lineTo(264,y);c.lineTo(256,y+12);c.lineTo(248,y);c.closePath();c.fill();}
 return canvas;
}
