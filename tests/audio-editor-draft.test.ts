import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AudioInspector} from '../apps/web/src/AudioEditor.js';
import {audioFixture} from './fixtures/audio.js';

test('legacy percentage pending text remains editable; malformed text never becomes silence or crashes the dB inspector',()=>{
  const f=audioFixture();
  const render=(gainPercent:string)=>{
    const text=JSON.stringify({name:f.clip.name,enabled:true,gain:'1',gainPercent,start:'0.4',duration:'0.6',offset:'0',fadeIn:'0',fadeOut:'0'});
    return renderToStaticMarkup(React.createElement(AudioInspector,{clip:f.clip,asset:f.asset,pending:{text,baseline:text},onPending(){},onApply(){},onRemove(){},onLock(){},isLocked:()=>false,disabled:false}));
  };
  for(const value of ['','-','NaN','401']){
    const html=render(value);assert.match(html,/Stara edycja procentowa jest niekompletna/);assert.match(html,/aria-invalid="true"/);assert.doesNotMatch(html,/value="(?:NaN|Infinity)"/);
  }
  assert.match(render('150'),/value="3\.52"/);assert.match(render('300'),/value="9\.54"/);
  assert.match(render('0'),/aria-label="Wycisz klip"[^>]*checked=""/);
});
