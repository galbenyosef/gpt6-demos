// Opt-in real API test through the app. The browser receives no credentials.
import {chromium,expect} from '@playwright/test';
const executablePath=process.env.CHROMIUM_PATH;
const browser=await chromium.launch({executablePath,headless:true,env:Object.fromEntries(Object.entries(process.env).filter(([key,value])=>!key.startsWith('OPENAI_')&&value!==undefined)) as Record<string,string>});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:3000');await expect(page.locator('#connection-label')).toHaveText('OpenAI connected');
 await page.locator('#project-name').fill('Robot coffee — live API study');await page.locator('#quality').selectOption('low');await page.locator('#prompt').fill('A tiny handmade clay robot with blue body and round amber eyes sitting at a wooden desk in a small workshop, warm morning sunlight, tactile stop-motion aesthetic.');
 console.log('Live browser: CREATE with Flare.');await page.locator('#generate').click();await expect(page.locator('.thumb')).toHaveCount(1,{timeout:250000});
 await page.locator('[data-mode=EDIT]').click();await page.locator('[data-profile=PRECISE]').click();await page.locator('#prompt').fill('Add a small red ceramic coffee mug on the desk next to the robot’s right hand. Preserve the robot, its face and pose, camera, workshop, lighting, and composition.');
 console.log('Live browser: EDIT with Sunburst.');await page.locator('#generate').click();await expect(page.locator('.thumb')).toHaveCount(2,{timeout:250000});
 await page.locator('[data-mode=ANIMATE]').click();await page.locator('[data-profile=FAST]').click();await page.locator('#frame-count').fill('2');await page.locator('#prompt').fill('The robot slowly reaches its right hand toward the red coffee mug and grasps the handle. Keep the mug on the table and the camera still.');
 console.log('Live browser: two sequential motion edits with Flare.');await page.locator('#generate').click();await page.locator('#accept').click();await expect(page.locator('.thumb')).toHaveCount(3,{timeout:500000});await expect(page.locator('#generate')).toBeEnabled({timeout:10000});
 await page.screenshot({path:'test-results/live-studio.png'});await page.locator('#play').click();await page.waitForTimeout(1000);await page.locator('#play').click();await page.locator('#export').click();
 for(const [format,path] of [['project','test-results/live-study.Flip-slop'],['webm','test-results/live-study.webm'],['contact','test-results/live-contact.png']] as const){const pending=page.waitForEvent('download');await page.locator(`[data-export=${format}]`).click();await (await pending).saveAs(path);}
 expect(errors).toEqual([]);console.log('PASS: real browser create, precise edit, sequential motion, playback, portable project and WebM export.');
}catch(e){await page.screenshot({path:'test-results/live-browser-failure.png'});console.error(e instanceof Error?e.message:'Live browser failed');process.exitCode=1;}finally{await browser.close();}
