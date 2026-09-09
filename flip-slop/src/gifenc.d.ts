declare module 'gifenc' {
 export function GIFEncoder(): {writeFrame:(index:Uint8Array,width:number,height:number,options:any)=>void;finish:()=>void;bytesView:()=>Uint8Array};
 export function quantize(data:Uint8ClampedArray,count:number):number[][];
 export function applyPalette(data:Uint8ClampedArray,palette:number[][]):Uint8Array;
}
