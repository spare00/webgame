import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const intervals=new Map(),timeouts=new Map();let id=0;
 function element(tag='div'){const classes=new Set();return {tagName:tag,dataset:{},style:{},children:[],attrs:{},textContent:'',set innerHTML(v){this.children=[]},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},setAttribute(k,v){this.attrs[k]=v},addEventListener(){},appendChild(v){this.children.push(v)}}}
 const elements=new Map();
 const context=vm.createContext({document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element},window:{location:{}},setInterval:f=>{intervals.set(++id,f);return id},clearInterval:id=>intervals.delete(id),setTimeout:f=>{timeouts.set(++id,f);return id},clearTimeout:id=>timeouts.delete(id)});
 const html=fs.readFileSync(new URL('../memory.html',import.meta.url),'utf8');
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 return {run:s=>vm.runInContext(s,context),intervals,timeouts,elements};
}
test('16 keyboard buttons, eight pairs, timer starts only on first flip',()=>{const g=setup();assert.equal(g.run('cards.length'),16);assert.equal(g.run('new Set(cards.map(c=>c.value)).size'),8);assert.equal(g.run('cards.every(c=>c.element.tagName==="button")'),true);assert.equal(g.intervals.size,0);g.run('flipCard(cards[0].element);flipCard(cards[0].element)');assert.equal(g.run('flippedCards.length'),1);assert.equal(g.run('attempts'),0);assert.equal(g.intervals.size,1)});
test('mismatch blocks third flip and restart cancels pending work',()=>{const g=setup();g.run('flipCard(cards[0].element);flipCard(cards.find(c=>c.value!==cards[0].value).element)');assert.equal(g.run('attempts'),1);assert.equal(g.timeouts.size,1);g.run('flipCard(cards.find(c=>!c.element.classList.contains("flipped")).element)');assert.equal(g.run('flippedCards.length'),2);g.run('initGame()');assert.equal(g.timeouts.size,0);assert.equal(g.intervals.size,0);assert.equal(g.run('attempts'),0);assert.equal(g.run('isProcessing'),false)});
test('mismatch resolves and all matches stop timer and show win',()=>{const g=setup();g.run('flipCard(cards[0].element);flipCard(cards.find(c=>c.value!==cards[0].value).element)');for(const f of g.timeouts.values())f();g.timeouts.clear();assert.equal(g.run('flippedCards.length'),0);g.run('for(const value of EMOJIS){for(const c of cards.filter(c=>c.value===value))flipCard(c.element)}');assert.equal(g.run('matchedPairs'),8);assert.equal(g.run('attempts'),9);assert.equal(g.intervals.size,0);assert.equal(g.elements.get('win-message').style.display,'block')});
