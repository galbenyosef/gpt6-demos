import { AppError, validateImageRequest, validatePlan } from './validation';
import { OpenAIImageGateway, profiles, providerRequest, type ImageModelGateway } from './openai/image-gateway';
export const maxBatch = Math.max(1, Math.min(24, Number(process.env.MAX_BATCH_SIZE) || 24));
export function createApi(gateway: ImageModelGateway = new OpenAIImageGateway()) {
  let active = 0;
  return async (request: Request): Promise<Response> => {
    const json = (data: unknown, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    try {
      const url = new URL(request.url);
      if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new AppError('FORBIDDEN','Local access only.',403);
      const origin=request.headers.get('origin');
      if (origin && origin !== url.origin) throw new AppError('FORBIDDEN','Cross-origin requests are not allowed.',403);
      if (request.method==='GET' && url.pathname==='/api/health') return json({ok:true,configured:!!process.env.OPENAI_API_KEY});
      if (request.method==='GET' && url.pathname==='/api/models') return json({profiles:profiles().map(p=>({...p,configured:!!p.id})),maxBatch,planner:!!process.env.OPENAI_PLANNER_MODEL});
      if (request.method!=='POST') return json({error:{code:'NOT_FOUND',message:'Not found.'}},404);
      if (!request.headers.get('content-type')?.includes('application/json')) throw new AppError('INVALID_INPUT','JSON required.',415);
      if (active >= 3) throw new AppError('RATE_LIMIT','Three generations are already running.',429,true);
      if (Number(request.headers.get('content-length'))>85_000_000) throw new AppError('INVALID_INPUT','Request too large.',413);
      let bytes=0; const reader=request.body?.getReader(); const chunks:Uint8Array[]=[];
      if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>85_000_000){await reader.cancel();throw new AppError('INVALID_INPUT','Request too large.',413);}chunks.push(value);}
      let raw:any;try{raw=JSON.parse(await new Blob(chunks as BlobPart[]).text());}catch{throw new AppError('INVALID_INPUT','Invalid JSON.');}
      if (url.pathname==='/api/images/generate'||url.pathname==='/api/images/edit') {
        const edit=url.pathname.endsWith('/edit'), input=validateImageRequest(raw,edit);
        active++;try{return json(await (edit?gateway.edit(input,request.signal):gateway.generate(input,request.signal)));}finally{active--;}
      }
      if(url.pathname==='/api/motion/plan') {
        const count=raw.count;
        if(!Number.isInteger(count)||count<1||count>maxBatch||typeof raw.prompt!=='string'||!raw.prompt.trim()||raw.prompt.length>6000)throw new AppError('INVALID_INPUT','Enter motion and a valid frame count.');
        const model=process.env.OPENAI_PLANNER_MODEL;
        if(!model) return json(validatePlan({frames:Array.from({length:count},(_,i)=>({index:i+1,instruction:`${raw.prompt}\nProgress to ${Math.round((i+1)/(count+1)*100)}% of the motion toward the target keyframe. Make one small physical pose change from the previous frame. Preserve identity, scene, camera, lighting and all unrelated elements.`}))},count));
        const schema={type:'object',properties:{frames:{type:'array',minItems:count,maxItems:count,items:{type:'object',properties:{index:{type:'integer'},instruction:{type:'string'}},required:['index','instruction'],additionalProperties:false}}},required:['frames'],additionalProperties:false};
        active++;try { const result=await providerRequest('responses',{model,input:`Plan ${count} incremental stop-motion edits from start toward end. Index 1 through ${count}. Motion: ${raw.prompt}`,text:{format:{type:'json_schema',name:'motion_plan',strict:true,schema}}},request.signal) as any;
          const output=result.output?.flatMap((o:any)=>o.content??[]).find((c:any)=>c.type==='output_text')?.text;return json(validatePlan(JSON.parse(output),count));
        } finally {active--;}
      }
      return json({error:{code:'NOT_FOUND',message:'Not found.'}},404);
    }catch(error){const e=error instanceof AppError?error:new AppError('UNKNOWN','The request could not be completed.',500);return json({error:{code:e.code,message:e.message,retryable:e.retryable}},e.status);}
  };
}
