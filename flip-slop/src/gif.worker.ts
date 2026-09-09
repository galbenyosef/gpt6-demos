import {GIFEncoder,quantize,applyPalette} from 'gifenc';
const encoder=GIFEncoder();
self.onmessage=(event:MessageEvent)=>{
  try{
    if(event.data.finish){encoder.finish();const bytes=encoder.bytesView().slice();self.postMessage({bytes},[bytes.buffer]);return;}
    const {rgba,width,height,delay,repeat}=event.data;
    const palette=quantize(new Uint8ClampedArray(rgba),256);
    encoder.writeFrame(applyPalette(new Uint8ClampedArray(rgba),palette),width,height,{palette,delay,repeat});
    self.postMessage({ready:true});
  }catch{self.postMessage({error:'GIF encoding failed.'});}
};
