import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OH_MY_RALPHA_TRIGGER_PHRASES,
  detectExplicitTrigger,
  detectImplicitTrigger,
  detectOhMyRalpha,
} from '../src/keywords.mjs';

describe('oh-my-ralpha keyword surface', () => {
  it('supports the public trigger phrases', () => {
    assert.ok(OH_MY_RALPHA_TRIGGER_PHRASES.includes('oh-my-ralpha'));
    assert.ok(OH_MY_RALPHA_TRIGGER_PHRASES.includes('ralpha'));
    assert.ok(OH_MY_RALPHA_TRIGGER_PHRASES.includes('继续处理'));
  });

  it('resolves explicit $ralpha to oh-my-ralpha', () => {
    assert.deepEqual(detectExplicitTrigger('$ralpha continue the backlog'), {
      keyword: '$ralpha',
      skill: 'oh-my-ralpha',
      priority: 8,
    });
  });

  it('resolves 继续处理 as an implicit trigger', () => {
    assert.deepEqual(detectImplicitTrigger('我们继续处理这个 backlog'), {
      keyword: '继续处理',
      skill: 'oh-my-ralpha',
      priority: 8,
    });
  });

  it('requires workflow intent for bare oh-my-ralpha mentions', () => {
    assert.equal(detectImplicitTrigger('Review the oh-my-ralpha P0-01 slice for acceptance.'), null);
    assert.deepEqual(detectImplicitTrigger('run oh-my-ralpha workflow for the backlog'), {
      keyword: 'oh-my-ralpha',
      skill: 'oh-my-ralpha',
      priority: 8,
    });
    assert.deepEqual(detectImplicitTrigger('ralpha keep going on the backlog'), {
      keyword: 'ralpha',
      skill: 'oh-my-ralpha',
      priority: 8,
    });
  });

  it('prefers explicit trigger when both are present', () => {
    assert.deepEqual(detectOhMyRalpha('$ralpha 我们继续处理这个 backlog'), {
      keyword: '$ralpha',
      skill: 'oh-my-ralpha',
      priority: 8,
    });
  });
});
