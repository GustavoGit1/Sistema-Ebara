import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = await readFile(new URL('../src/lib/storage-pallet-rack.js', import.meta.url), 'utf8');
const { palletRackCapacity, palletRackPieces } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('default rack has three pallets; eight metres has four levels', () => {
  assert.deepEqual(palletRackCapacity({width:3.9,height:2}), {levels:1,bays:1,pallets:3});
  assert.deepEqual(palletRackCapacity({width:3.9,height:8}), {levels:4,bays:1,pallets:12});
  assert.deepEqual(palletRackCapacity({width:7.8,height:8}), {levels:4,bays:2,pallets:24});
});
test('only full modules increase capacity and resize regenerates visual pallets', () => {
  assert.equal(palletRackCapacity({width:7.79,height:7.99}).pallets, 9);
  for (const dimensions of [{width:3.9,height:2,depth:1.2},{width:7.8,height:8,depth:1.2},{width:0.01,height:0.01,depth:0.01}]) {
    const pieces = palletRackPieces(dimensions);
    assert.equal(pieces.filter(p => p.color === '#b58b55').length, palletRackCapacity(dimensions).pallets);
    assert.ok(pieces.every(p => p.size.every(n => Number.isFinite(n) && n > 0) && p.position.every(Number.isFinite)));
  }
});
