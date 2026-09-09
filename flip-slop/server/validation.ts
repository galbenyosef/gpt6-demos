import {readDimensions} from './image-dimensions';
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false) { super(message); }
}
export function dimensions(width: unknown, height: unknown) {
  if (![width, height].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 256 && n <= 3840 && n % 16 === 0)) throw new AppError('INVALID_INPUT', 'Dimensions must be multiples of 16 between 256 and 3840.');
  const w = width as number, h = height as number;
  if (w / h < 1 / 3 || w / h > 3 || w * h > 8294400) throw new AppError('INVALID_INPUT', 'Use an aspect ratio between 1:3 and 3:1, up to 8.3 megapixels.');
  return { width: w, height: h };
}
export function imageData(value: unknown): string {
  if (typeof value !== 'string' || value.length > 20_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new AppError('INVALID_INPUT', 'Upload a PNG, JPEG or WebP image under 15 MB.');
  const [prefix, encoded] = value.split(',');
  const b = Buffer.from(encoded!, 'base64');
  const valid = prefix!.includes('png') ? b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : prefix!.includes('jpeg') ? b[0] === 255 && b[1] === 216 && b[2] === 255 : b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP';
  if (!valid) throw new AppError('INVALID_INPUT', 'Image content does not match its format.');
  const size=readDimensions(b,prefix!.slice(11).split(';')[0]!);
  if(!size||size.width<1||size.height<1||size.width>8192||size.height>8192||size.width*size.height>40_000_000)throw new AppError('INVALID_INPUT','Input images must have valid dimensions, at most 8192 pixels per edge and 40 megapixels.');
  return value;
}
export interface ImageInput { prompt: string; width: number; height: number; modelProfile: 'FAST'|'PRECISE'; quality: 'low'|'medium'|'high'; images: string[]; mask?: string }
export function validateImageRequest(raw: any, edit: boolean): ImageInput {
  if (!raw || typeof raw !== 'object') throw new AppError('INVALID_INPUT','Invalid request.');
  if (typeof raw.prompt !== 'string' || !raw.prompt.trim() || raw.prompt.length > 24000) throw new AppError('INVALID_INPUT','Enter a prompt of 1–24,000 characters.');
  const size = dimensions(raw.width, raw.height);
  if (!['FAST','PRECISE'].includes(raw.modelProfile)) throw new AppError('INVALID_INPUT','Choose Fast or Precise.');
  if (!['low','medium','high'].includes(raw.quality ?? 'medium')) throw new AppError('INVALID_INPUT','Invalid quality.');
  const images = raw.images ?? [];
  if (!Array.isArray(images) || images.length > 8 || (edit && !images.length)) throw new AppError('INVALID_INPUT','Edits require a source image; up to eight inputs are supported.');
  return { prompt: raw.prompt.trim(), ...size, modelProfile: raw.modelProfile, quality: raw.quality ?? 'medium', images: images.map(imageData), ...(raw.mask ? {mask: imageData(raw.mask)} : {}) };
}
export function validatePlan(raw: any, count: number): {frames: {index:number; instruction:string}[]} {
  if (!raw || !Array.isArray(raw.frames) || raw.frames.length !== count || raw.frames.some((f:any,i:number) => f.index !== i + 1 || typeof f.instruction !== 'string' || !f.instruction.trim() || f.instruction.length > 4000)) throw new AppError('INVALID_INPUT','The motion plan is invalid.');
  return raw;
}
