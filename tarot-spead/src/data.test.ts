import {test,expect} from 'bun:test';
import {cards,drawCards,getCard,spreads} from './data';
import {discoverDecks} from '../scripts/decks';
test('all 78 canonical cards have complete bilingual interpretations',()=>{
 expect(cards).toHaveLength(78);expect(new Set(cards.map(c=>c.id)).size).toBe(78);
 for(const c of cards){expect(c.id).toMatch(/^[a-z-]+$/);for(const key of ['name','theme','meaning','advice','reversed'] as const){expect(c[key].en.length).toBeGreaterThan(2);expect(c[key].es.length).toBeGreaterThan(2);}}
});
test('draws contain no duplicates and respect reversal configuration',()=>{
 for(let i=0;i<50;i++){const result=drawCards(78,false);expect(new Set(result.map(c=>c.id)).size).toBe(78);expect(result.every(c=>!c.reversed)).toBe(true);}
 expect(drawCards(10,true,()=>.1).every(c=>c.reversed)).toBe(true);
 expect(drawCards(10,true,()=>.7).every(c=>!c.reversed)).toBe(true);
 expect(()=>drawCards(79,false)).toThrow();expect(()=>drawCards(0,false)).toThrow();
});
test('each spread has clear positions in both languages',()=>{
 expect(spreads.map(s=>s.positions.length).sort((a,b)=>a-b)).toEqual([1,3,5,10]);
 for(const s of spreads){for(const p of s.positions){expect(p.name.en).toBeTruthy();expect(p.name.es).toBeTruthy();expect(p.description.en.length).toBeGreaterThan(20);expect(p.description.es.length).toBeGreaterThan(20);}}
});
test('both supplied decks resolve all 78 normalized images and retain Etteilla identities',async()=>{
 const decks=await discoverDecks();expect(decks.map(d=>d.id)).toEqual(['rider-waite-tarot','etteilla-tarot']);
 for(const deck of decks){expect(Object.keys(deck.files)).toHaveLength(78);for(const card of cards){expect(await Bun.file(`public/decks/${deck.id}/${deck.files[card.id]}`).exists()).toBe(true);}}
 const e=decks.find(d=>d.id==='etteilla-tarot')!;expect(getCard('world',e).name.en).toBe('Chaos');expect(getCard('high-priestess',e).name.es).toBe('El Reposo');
 const mapping=await Bun.file('public/decks/etteilla-tarot/source-map.json').json();expect(mapping['ace-of-wands']).toBe('35 Ace of Wands.jpg');expect(mapping['king-of-pentacles']).toBe('64 King of Coins.jpg');expect(mapping.fool).toBe("78 Le Folie ou l'Alchimiste.jpg");
});
