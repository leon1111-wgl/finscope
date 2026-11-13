// Loads the universe files from disk for scripts and tests, exactly as the page loads them over HTTP.
import fs from 'node:fs';
import path from 'node:path';
import {prepareIndex, buildScreen} from '../web/universe-data.js';

export function universeFromDisk(dir) {
  if (!fs.existsSync(path.join(dir, 'index.json'))) return null;
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const prepared = prepareIndex(index);
  const shards = {};
  let screen = null;
  const shard = cik => (shards[cik] ||= JSON.parse(fs.readFileSync(path.join(dir, 'c', `${cik}.json`), 'utf8')));
  const loadScreen = () => (screen ||= buildScreen(JSON.parse(fs.readFileSync(path.join(dir, 'screen.json'), 'utf8')), prepared));
  return {
    index, prepared, shard, screen: loadScreen,
    base: {index},
    contextFor: plan => {
      const ctx = {index, shards: {}, screen: plan.screen ? loadScreen() : null};
      for (const c of plan.ciks) ctx.shards[c] = shard(c);
      return ctx;
    }
  };
}
