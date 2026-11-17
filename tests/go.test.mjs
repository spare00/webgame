import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(){
  const elements=new Map(),timers=new Map();let timerId=0;
  const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(obj,key)=>obj[key]??(()=>{})});
  const element=()=>({value:'9',width:620,height:620,classList:{add(){},remove(){}},listeners:{},setAttribute(k,v){this[k]=v},addEventListener(k,f){this.listeners[k]=f},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:310,height:310})});
  const context=vm.createContext({document:{querySelector:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)}},setTimeout:f=>{timers.set(++timerId,f);return timerId},clearTimeout:id=>timers.delete(id)});
  const script=fs.readFileSync(new URL('../go.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script.replace('  newGame();','  globalThis.inspect=code=>eval(code);\n  newGame();'),context);
  return {run:code=>context.inspect(code),elements,timers};
}

test('board size resets play and pending AI; scaled clicks reach the last intersection',()=>{
  const g=setup();assert.equal(g.run('board.length'),9);
  g.run('play(4,4,BLACK)');assert.equal(g.timers.size,1);
  g.elements.get('#board-size').value='13';g.elements.get('#board-size').listeners.change();
  assert.equal(g.timers.size,0);assert.equal(g.run('board.length'),13);
  assert.equal(g.run('history.length'),0);assert.equal(g.elements.get('#board')['aria-label'],'13줄 바둑판');
  g.elements.get('#board').listeners.click({clientX:295,clientY:295});
  assert.equal(g.run('board[12][12]'),1);
  g.run('thinking=false;undo()');assert.equal(g.run('board[12][12]'),0);
  g.run('pass()');[...g.timers.values()][0]();assert.equal(g.run('scoring'),true);
  g.run('endGame()');assert.equal(g.run('finished'),true);
});

test('AI saves an atari group and captures an exposed opponent',()=>{
  const g=setup();
  g.run('board[4][4]=WHITE;board[3][4]=BLACK;board[4][3]=BLACK;board[5][4]=BLACK');
  assert.equal(g.run('chooseAI().slice(0,2).join()'),'5,4');
  g.run('newGame();board[4][4]=BLACK;board[3][4]=WHITE;board[4][3]=WHITE;board[5][4]=WHITE');
  assert.equal(g.run('chooseAI().slice(0,2).join()'),'5,4');
});

test('scoring walkthrough counts territory, neutral points and dead stones on both sizes',()=>{
  for(const size of [9,13]){
    const g=setup();g.elements.get('#board-size').value=String(size);g.run('newGame();for(let y=0;y<N;y++){board[y][1]=BLACK;board[y][N-2]=WHITE;}beginScoring()');
    assert.equal(g.elements.get('#counting').hidden,false);
    assert.equal(g.run('scoreDetails().stones.join()'),`${size},${size}`);
    assert.equal(g.run('scoreDetails().territory.join()'),`${size},${size}`);
    assert.equal(g.run('scoreDetails().regions.filter(r=>!r.owner).reduce((s,r)=>s+r.points.length,0)'),size*(size-4));
    assert.equal(g.run('score().join()'),`${size*2},${size*2+6.5}`);
    for(let i=0;i<3;i++)g.elements.get('#count-next').listeners.click();
    assert.equal(g.run('countStep'),3);
    assert.match(g.elements.get('#count-detail').textContent,/덤 6.5/);
    g.run('toggleDead(1,0)');assert.equal(g.run('countStep'),0);
    assert.equal(g.run('scoreDetails().stones.join()'),`0,${size}`);
    assert.equal(g.run('score().join()'),`0,${size*size+6.5}`);
    g.run('resumeGame()');assert.equal(g.run('dead.size'),0);
    assert.equal(g.elements.get('#counting').hidden,true);
    assert.equal(g.run('score().join()'),`${size*2},${size*2+6.5}`);
    g.run('beginScoring();endGame()');assert.equal(g.run('countStep'),3);
    assert.equal(g.elements.get('#counting').hidden,false);
    g.run('newGame()');assert.equal(g.elements.get('#counting').hidden,true);
  }
});
