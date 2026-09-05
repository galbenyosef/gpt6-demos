import {useEffect,useRef} from 'react';
type Actions = {read:()=>unknown;reveal:(indices:number[])=>void;count:()=>number};
type Context = {registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
/** Optional progressive enhancement; the app has no dependency on WebMCP. */
export function useTarotTools(actions:Actions){
 const current=useRef(actions);current.current=actions;
 useEffect(()=>{
  const context=(document as Document & {modelContext?:Context}).modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const register=(tool:Parameters<Context['registerTool']>[0])=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'get_tarot_reading',description:'Read the current spread, visible cards, positions, and interpretations. Unrevealed card identities are not returned.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>current.current.read()});
  register({name:'reveal_tarot_cards',description:'Turn the specified zero-based card positions face up in the current reading. This reveals cards; it does not draw a new reading.',inputSchema:{type:'object',properties:{indices:{type:'array',items:{type:'integer',minimum:0},minItems:1,uniqueItems:true}},required:['indices'],additionalProperties:false},annotations:{readOnlyHint:false},async execute(input){
   if(!input||typeof input!=='object'||!('indices' in input)||Object.keys(input).some(k=>k!=='indices'))throw new Error('Expected an indices array');
   const indices=(input as {indices:unknown}).indices;
   if(!Array.isArray(indices)||!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=current.current.count())||new Set(indices).size!==indices.length)throw new Error('Invalid card positions');
   current.current.reveal(indices);
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   return current.current.read();
  }});
  return()=>lifecycle.abort();
 },[]);
}
