import { AppError, type ImageInput } from '../validation';
export interface GeneratedImage { data: string; mimeType: string; model: string; createdAt: number; width: number; height: number }
export interface ImageModelGateway { generate(input: ImageInput, signal?: AbortSignal): Promise<GeneratedImage>; edit(input: ImageInput, signal?: AbortSignal): Promise<GeneratedImage> }
export const profiles = () => [
  { role: 'FAST', label: 'Flare', id: process.env.OPENAI_IMAGE_FAST_MODEL || '' },
  { role: 'PRECISE', label: 'Sunburst', id: process.env.OPENAI_IMAGE_PRECISE_MODEL || '' },
];
export async function providerRequest(path: string, body: unknown, signal?: AbortSignal) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AppError('NOT_CONFIGURED','Add your OpenAI API key to the server .env file.',503);
  const combined = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(240_000)]);
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try { response = await fetch(`https://api.openai.com/v1/${path}`, {method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:combined}); }
    catch { throw new AppError(combined.aborted ? 'TIMEOUT' : 'NETWORK', combined.aborted ? 'Generation stopped or timed out. Try again when ready.' : 'Unable to reach OpenAI. Your project is saved locally.',503,true); }
    if (response.ok) return response.json();
    const error = await response.json().catch(()=>({})) as any;
    const code = String(error?.error?.code ?? '');
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const delay = Math.min(10000, Math.max(1000 * 2 ** attempt, Number(response.headers.get('retry-after') || 0) * 1000));
      await new Promise<void>((resolve,reject) => { const timer=setTimeout(done,delay); function done(){combined.removeEventListener('abort',abort);resolve();} function abort(){clearTimeout(timer);reject(new AppError('TIMEOUT','Generation cancelled.',499));} combined.addEventListener('abort',abort,{once:true}); if(combined.aborted)abort(); });
      continue;
    }
    if (response.status === 401) throw new AppError('AUTHENTICATION','The server API key was rejected. Check .env.',503);
    if (response.status === 403 || response.status === 404 || /model/.test(code)) throw new AppError('MODEL_UNAVAILABLE','The configured model is unavailable to this account. Check the model profile in .env.',503);
    if (/safety|moderation|content_policy/.test(code)) throw new AppError('CONTENT_REJECTED','This request was rejected by the image safety system. Revise the prompt.',400);
    if (response.status === 429) throw new AppError('RATE_LIMIT','OpenAI rate or quota limit reached. Try again later.',429,true);
    throw new AppError('PROVIDER_ERROR',response.status === 400 ? 'OpenAI could not accept these image settings. Check the selected model, size and inputs.' : 'Image generation failed. Please try again.',502,response.status>=500);
  }
  throw new AppError('UNKNOWN','Generation failed.',502);
}
export class OpenAIImageGateway implements ImageModelGateway {
  generate(input: ImageInput, signal?: AbortSignal) { return this.run(input, !!input.images.length, signal); }
  edit(input: ImageInput, signal?: AbortSignal) { return this.run(input,true,signal); }
  private async run(input: ImageInput, edit: boolean, signal?: AbortSignal): Promise<GeneratedImage> {
    const model = profiles().find(p=>p.role===input.modelProfile)?.id;
    if (!model) throw new AppError('MODEL_UNAVAILABLE','Set the selected image model in .env.',503);
    const body: Record<string,unknown> = {model,prompt:input.prompt,size:`${input.width}x${input.height}`,quality:input.quality,n:1,output_format:'png'};
    if (edit) { body.images=input.images.map(image_url=>({image_url})); if(input.mask)body.mask={image_url:input.mask}; }
    const result = await providerRequest(edit?'images/edits':'images/generations',body,signal) as any;
    const data=result.data?.[0]?.b64_json;
    if (typeof data !== 'string') throw new AppError('UNKNOWN','The image service returned no image.',502);
    return {data,mimeType:'image/png',model,createdAt:Date.now(),width:input.width,height:input.height};
  }
}
