/** Read dimensions without decoding an untrusted image or fetching a remote URL. */
export function readDimensions(b:Buffer,mime:string):{width:number;height:number}|undefined{
  if(mime==='png'&&b.length>=24&&b.toString('ascii',12,16)==='IHDR')return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
  if(mime==='jpeg'){
    let offset=2;
    while(offset+4<=b.length){
      if(b[offset]!==0xff){offset++;continue;}
      while(b[offset]===0xff)offset++;
      const marker=b[offset++]!;
      if(marker===0xd9||marker===0xda)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(offset+2>b.length)break;
      const length=b.readUInt16BE(offset);if(length<2||offset+length>b.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return {width:b.readUInt16BE(offset+5),height:b.readUInt16BE(offset+3)};
      offset+=length;
    }
  }
  if(mime==='webp'&&b.length>=30){
    const type=b.toString('ascii',12,16);
    if(type==='VP8X')return {width:1+b.readUIntLE(24,3),height:1+b.readUIntLE(27,3)};
    if(type==='VP8 '&&b[23]===0x9d&&b[24]===0x01&&b[25]===0x2a)return {width:b.readUInt16LE(26)&0x3fff,height:b.readUInt16LE(28)&0x3fff};
    if(type==='VP8L'&&b[20]===0x2f)return {width:1+(((b[22]??0)&0x3f)<<8|b[21]!),height:1+(((b[24]??0)&0xf)<<10|b[23]!<<2|b[22]!>>6)};
  }
}
