import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectExplicitTrigger,
  detectImplicitTrigger,
  detectRalpha,
} from '../src/keywords.mjs';

describe('oh-my-ralpha keyword surface', () => {
  it('keeps $ralpha as the only public trigger command', () => {
    assert.equal(detectImplicitTrigger('$ralpha continue the backlog'), null);
  });

  it('resolves explicit $ralpha to the ralpha skill', () => {
    assert.deepEqual(detectExplicitTrigger('$ralpha continue the backlog'), {
      keyword: '$ralpha',
      skill: 'ralpha',
      priority: 8,
    });
  });

  it('does not support $oh-my-ralpha as a compatibility alias', () => {
    assert.equal(detectExplicitTrigger('$oh-my-ralpha continue the backlog'), null);
  });

  it('does not route natural-language continuation phrases without $ralpha', () => {
    assert.equal(detectImplicitTrigger('我们继续处理这个 backlog'), null);
    assert.equal(detectImplicitTrigger('finish the remaining work'), null);
    assert.equal(detectImplicitTrigger('ralpha keep going on the backlog'), null);
  });

  it('does not route package-name mentions', () => {
    assert.equal(detectImplicitTrigger('Review the oh-my-ralpha P0-01 slice for acceptance.'), null);
    assert.equal(detectImplicitTrigger('run oh-my-ralpha workflow for the backlog'), null);
  });

  it('prefers explicit trigger when both are present', () => {
    assert.deepEqual(detectRalpha('$ralpha 我们继续处理这个 backlog'), {
      keyword: '$ralpha',
      skill: 'ralpha',
      priority: 8,
    });
  });
});
