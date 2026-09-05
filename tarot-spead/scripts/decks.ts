import { readdir, mkdir } from 'node:fs/promises';
import { cards, bi, type Deck, type Card } from '../src/data';
const root = new URL('../public/decks/', import.meta.url).pathname;
// These are artwork slots shared with other decks; the displayed Etteilla identities remain distinct.
const historical = [
['world','Chaos','El Caos','Origins','Orígenes','Before a form emerges, possibilities remain open. Give an uncertain beginning room to develop.','Antes de que aparezca una forma, las posibilidades siguen abiertas. Dale espacio a un comienzo incierto.'],
['sun','Light','La Luz','Illumination','Iluminación','Clarity begins when you distinguish what is visible from what you have only assumed.','La claridad empieza al distinguir lo visible de lo que solo has supuesto.'],
['empress','Plants','Las Plantas','Growth','Crecimiento','Living things grow through steady nourishment. Notice what needs care and time.','Los seres vivos crecen con alimento constante. Observa lo que necesita cuidado y tiempo.'],
['star','The Sky','El Cielo','Perspective','Perspectiva','A wider view can make an immediate concern easier to understand.','Una visión más amplia puede ayudarte a comprender una inquietud inmediata.'],
['chariot','Humankind & the Animals','La humanidad y los animales','Instinct','Instinto','Consider how instinct and conscious intention can cooperate instead of competing.','Considera cómo pueden cooperar el instinto y la intención consciente en lugar de competir.'],
['moon','The Celestial Bodies','Los Astros','Rhythm','Ritmo','Look for the rhythms shaping your energy and attention rather than forcing a constant pace.','Observa los ritmos que dan forma a tu energía y atención sin forzar un ritmo constante.'],
['lovers','Birds & Fish','Las aves y los peces','Adaptation','Adaptación','Different environments call for different ways of moving. Work with your circumstances.','Entornos diferentes piden distintas formas de moverse. Trabaja con tus circunstancias.'],
['high-priestess','Rest','El Reposo','Restoration','Recuperación','Rest is part of a creative cycle. A pause can help you return with more clarity.','El descanso forma parte del ciclo creativo. Una pausa puede ayudarte a volver con más claridad.'],
['hanged-man','Prudence','La Prudencia','Discernment','Discernimiento','A careful assessment can reveal consequences that a quick decision would miss.','Una evaluación cuidadosa puede revelar consecuencias que una decisión rápida pasaría por alto.'],
['hierophant','The High Priest','El Gran Sacerdote','Counsel','Consejo','Consider the responsibility that comes with offering or receiving guidance.','Considera la responsabilidad de ofrecer o recibir orientación.'],
['hermit','The Capuchin','El Capuchino','Simplicity','Sencillez','Stepping back from excess can make your essential needs easier to recognize.','Alejarte de los excesos puede ayudarte a reconocer tus necesidades esenciales.'],
['emperor','The African Ruler','El gobernante africano','Authority','Autoridad','Examine how power is used, and whether leadership serves the people affected by it.','Examina cómo se usa el poder y si el liderazgo sirve a las personas afectadas.'],
['fool','Folly / The Alchemist','La Locura / El Alquimista','Experimentation','Experimentación','Experimentation opens possibilities, but enthusiasm benefits from attention to consequences.','Experimentar abre posibilidades, pero el entusiasmo se beneficia de atender a las consecuencias.'],
];
export async function discoverDecks():Promise<Deck[]> {
 const entries=await readdir(root,{withFileTypes:true});const result:Deck[]=[];
 for(const entry of entries){if(!entry.isDirectory()||!/^[-a-z0-9]+$/.test(entry.name))continue;
 const files=await readdir(root+entry.name);const lookup:Record<string,string>={};
 for(const c of cards){const f=files.find(f=>['jpg','jpeg','png','webp','avif'].some(ext=>f===`${c.id}.${ext}`));if(f)lookup[c.id]=f;}
 if(Object.keys(lookup).length!==78){console.warn(`Skipping incomplete deck ${entry.name}: ${Object.keys(lookup).length}/78 images.`);continue;}
 const custom=Bun.file(root+entry.name+'/deck.json');const meta=await custom.exists()?await custom.json():{};
 const isEtteilla=entry.name==='etteilla-tarot';
 const overrides:Record<string,Partial<Card>>={};
 if(isEtteilla)for(const [id,en,es,themeEn,themeEs,meaningEn,meaningEs] of historical){overrides[id!]={name:bi(en!,es!),theme:bi(themeEn!,themeEs!),meaning:bi(meaningEn!,meaningEs!),advice:bi(meaningEn!,meaningEs!),reversed:bi(`Consider what may be blocking this theme. ${meaningEn}`,`Considera qué puede estar bloqueando este tema. ${meaningEs}`)};}
 const title=entry.name==='rider-waite-tarot'?'Rider–Waite–Smith':isEtteilla?'Grand Etteilla':entry.name.split('-').map(w=>w[0]!.toUpperCase()+w.slice(1)).join(' ');
 result.push({id:entry.name,name:meta.name||bi(title,title),description:meta.description||(isEtteilla?bi('An enigmatic eighteenth-century deck. Modern reflections inspired by its distinct imagery; not a reconstruction of historical Etteilla divination.','Una enigmática baraja del siglo XVIII. Reflexiones modernas inspiradas en sus imágenes propias; no reconstruye la adivinación histórica de Etteilla.'):bi('The iconic 1909 imagery of Pamela Colman Smith. A vivid language of symbols, intuition, and everyday experience.','Las icónicas imágenes de Pamela Colman Smith de 1909. Un lenguaje de símbolos, intuición y experiencia cotidiana.')),files:lookup,overrides:{...overrides,...meta.overrides}});
 }
 return result.sort((a,b)=>Number(b.id==='rider-waite-tarot')-Number(a.id==='rider-waite-tarot'));
}
if(import.meta.main){await mkdir(new URL('../public/',import.meta.url),{recursive:true});await Bun.write(new URL('../public/decks.json',import.meta.url),JSON.stringify(await discoverDecks(),null,2));console.log('Deck catalog updated.');}
