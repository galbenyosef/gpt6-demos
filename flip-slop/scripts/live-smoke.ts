// Explicit, opt-in API smoke test. Bun reads credentials only from the local .env.
// Provider responses and credentials are never logged or written to artifacts.
import {OpenAIImageGateway} from '../server/openai/image-gateway';
import {validateImageRequest} from '../server/validation';
const gateway=new OpenAIImageGateway();
if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY is missing from .env.');
const started=Date.now();
const input=validateImageRequest({prompt:'A tiny handmade clay robot sitting at a wooden desk in a small workshop, warm morning sunlight, tactile stop-motion aesthetic. The robot has two round amber eyes and a blue body.',width:1024,height:1024,modelProfile:'FAST',quality:'low'},false);
console.log('Live smoke: generating with the FAST profile.');
try {
  const first=await gateway.generate(input);
  const bytes=Buffer.from(first.data,'base64');
  if(bytes.length<1000||bytes[0]!==137)throw Error('Invalid generated image.');
  console.log(`PASS: generated PNG (${bytes.length} bytes).`);
  const edited=await gateway.edit({...input,prompt:'Add a small red ceramic coffee mug on the wooden desk beside the robot. Preserve the robot, its face, camera, composition and lighting.',images:[`data:image/png;base64,${first.data}`]});
  if(edited.data===first.data||Buffer.from(edited.data,'base64').length<1000)throw Error('Edit did not produce a new image.');
  console.log('PASS: edited source into a distinct PNG.');
  // Image-only artifacts are ignored by Git. No provider request or credential is persisted.
  await Bun.write('test-results/live-create.png',bytes);
  await Bun.write('test-results/live-edit.png',Buffer.from(edited.data,'base64'));
  console.log(`Live generation and edit completed in ${Math.round((Date.now()-started)/1000)}s.`);
} catch(error) {
  // Gateway errors are normalized and contain no raw provider details.
  console.error(error instanceof Error?error.message:'Live smoke failed.');process.exitCode=1;
}
