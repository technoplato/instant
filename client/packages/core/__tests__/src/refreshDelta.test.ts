import { test, expect, describe } from 'vitest';
import * as s from '../../src/store.ts';
import query from '../../src/instaql.ts';
import Reactor from '../../src/Reactor.js';
import InMemoryStorage from '../../src/InMemoryStorage.js';

function makeAttr(
  etype: string,
  label: string,
  valueType: 'blob' | 'ref',
  cardinality: 'one' | 'many',
  isPrimary = false,
) {
  const id = `attr-${etype}-${label}`;
  return {
    id,
    'forward-identity': [`fwd-${etype}-${label}`, etype, label],
    'value-type': valueType,
    cardinality,
    'unique?': isPrimary,
    'index?': false,
    'primary?': isPrimary,
  };
}

function makeFixtures() {
  const attrs = [
    makeAttr('recordings', 'id', 'blob', 'one', true),
    makeAttr('recordings', 'title', 'blob', 'one'),
    makeAttr('recordings', 'tags', 'blob', 'many'),
    makeAttr('segments', 'id', 'blob', 'one', true),
    makeAttr('segments', 'text', 'blob', 'one'),
    makeAttr('segments', 'seq', 'blob', 'one'),
    {
      id: 'attr-seg-recording',
      'forward-identity': ['fwd-seg-rec', 'segments', 'recording'],
      'reverse-identity': ['rev-rec-segs', 'recordings', 'segments'],
      'value-type': 'ref',
      cardinality: 'one',
      'unique?': false,
      'index?': true,
    },
  ];
  const attrsMap: Record<string, any> = {};
  for (const a of attrs) {
    attrsMap[a.id] = a;
  }
  const attrsStore = new s.AttrsStoreClass(attrsMap, null);
  const byName = (etype: string, label: string) =>
    attrs.find(
      (a) =>
        a['forward-identity'][1] === etype &&
        a['forward-identity'][2] === label,
    )!.id;

  return { attrsMap, attrsStore, byName };
}

describe('applyTriplesDelta (refresh-delta client applier)', () => {
  test('matches full createStore across nested updates, cardinality-one replacements, cardinality-many edits, and removed-entities', () => {
    const { attrsStore, byName } = makeFixtures();
    const recIdAttr = byName('recordings', 'id');
    const recTitleAttr = byName('recordings', 'title');
    const recTagsAttr = byName('recordings', 'tags');
    const segIdAttr = byName('segments', 'id');
    const segTextAttr = byName('segments', 'text');
    const segSeqAttr = byName('segments', 'seq');
    const segRecAttr = 'attr-seg-recording';

    const initialTriples: any[] = [
      ['rec-1', recIdAttr, 'rec-1', 100],
      ['rec-1', recTitleAttr, 'Initial Title', 100],
      ['rec-1', recTagsAttr, 'live', 100],
      ['rec-1', recTagsAttr, 'draft', 100],
      ['seg-1', segIdAttr, 'seg-1', 101],
      ['seg-1', segTextAttr, 'hello', 101],
      ['seg-1', segSeqAttr, 1, 101],
      ['seg-1', segRecAttr, 'rec-1', 101],
      ['seg-2', segIdAttr, 'seg-2', 102],
      ['seg-2', segTextAttr, 'world', 102],
      ['seg-2', segSeqAttr, 2, 102],
      ['seg-2', segRecAttr, 'rec-1', 102],
    ];

    const baseStore = s.createStore(attrsStore, initialTriples, false, false);

    // Server sends minimal triples-delta:
    // 1) Update rec-1 title (cardinality-one: old title omitted from `removed`)
    // 2) Remove tag 'draft', add tag 'final' (cardinality-many)
    // 3) Remove seg-2 entirely via `removed-entities`
    // 4) Add seg-3 linked to rec-1
    const delta: s.TriplesDelta = {
      'base-version': 1,
      'removed-entities': ['seg-2'],
      removed: [['rec-1', recTagsAttr, 'draft', 100]],
      added: [
        ['rec-1', recTitleAttr, 'Updated Title', 200],
        ['rec-1', recTagsAttr, 'final', 200],
        ['seg-3', segIdAttr, 'seg-3', 201],
        ['seg-3', segTextAttr, 'streaming', 201],
        ['seg-3', segSeqAttr, 3, 201],
        ['seg-3', segRecAttr, 'rec-1', 201],
      ],
    };

    const deltaStore = s.applyTriplesDelta(baseStore, attrsStore, delta);

    // Ensure baseStore was NOT mutated (immutable snapshot safety)
    const q = { recordings: { segments: {} } };
    const beforeRes = query({ store: baseStore, attrsStore }, q);
    expect(beforeRes.data.recordings[0].title).toBe('Initial Title');
    expect(beforeRes.data.recordings[0].segments).toHaveLength(2);

    // Build expected ground-truth store from scratch
    const expectedTriples: any[] = [
      ['rec-1', recIdAttr, 'rec-1', 100],
      ['rec-1', recTitleAttr, 'Updated Title', 200],
      ['rec-1', recTagsAttr, 'live', 100],
      ['rec-1', recTagsAttr, 'final', 200],
      ['seg-1', segIdAttr, 'seg-1', 101],
      ['seg-1', segTextAttr, 'hello', 101],
      ['seg-1', segSeqAttr, 1, 101],
      ['seg-1', segRecAttr, 'rec-1', 101],
      ['seg-3', segIdAttr, 'seg-3', 201],
      ['seg-3', segTextAttr, 'streaming', 201],
      ['seg-3', segSeqAttr, 3, 201],
      ['seg-3', segRecAttr, 'rec-1', 201],
    ];
    const fullStore = s.createStore(attrsStore, expectedTriples, false, false);

    const deltaRes = query({ store: deltaStore, attrsStore }, q);
    const fullRes = query({ store: fullStore, attrsStore }, q);
    expect(deltaRes.data).toEqual(fullRes.data);
    expect(deltaRes.data.recordings[0].title).toBe('Updated Title');
    expect(deltaRes.data.recordings[0].segments.map((x: any) => x.text)).toEqual([
      'hello',
      'streaming',
    ]);
    // Verify stale vae entry for removed seg-2 was cleaned up
    expect(deltaStore.vae.get('rec-1')?.get(segRecAttr)?.has('seg-2')).toBe(
      false,
    );
  });

  test('retracts stale vae entry when a cardinality-one ref changes target', () => {
    const { attrsStore, byName } = makeFixtures();
    const recIdAttr = byName('recordings', 'id');
    const segIdAttr = byName('segments', 'id');
    const segRecAttr = 'attr-seg-recording';

    const baseStore = s.createStore(
      attrsStore,
      [
        ['rec-1', recIdAttr, 'rec-1', 1],
        ['rec-2', recIdAttr, 'rec-2', 1],
        ['seg-1', segIdAttr, 'seg-1', 1],
        ['seg-1', segRecAttr, 'rec-1', 1],
      ],
      false,
      false,
    );

    const nextStore = s.applyTriplesDelta(baseStore, attrsStore, {
      added: [['seg-1', segRecAttr, 'rec-2', 2]],
    });

    expect(nextStore.vae.get('rec-1')?.get(segRecAttr)?.has('seg-1')).toBe(
      false,
    );
    expect(nextStore.vae.get('rec-2')?.get(segRecAttr)?.has('seg-1')).toBe(
      true,
    );
  });

  test('Reactor applies matching refresh-delta and resubscribes on base-version mismatch', async () => {
    const { attrsMap, byName } = makeFixtures();
    const recIdAttr = byName('recordings', 'id');
    const recTitleAttr = byName('recordings', 'title');

    const sent: any[] = [];
    const reactor = new Reactor({
      appId: '00000000-0000-0000-0000-000000000001',
    });
    reactor._initStorage(InMemoryStorage);
    reactor._trySendAuthed = (_id: string, msg: any) => {
      sent.push(msg);
    };
    await reactor.querySubs.waitForMetaToLoad();
    await reactor.kv.waitForMetaToLoad();
    await reactor.kv.waitForKeyToLoad('pendingMutations');

    reactor._setAttrs(Object.values(attrsMap));

    const q = { recordings: {} };
    const seen: any[] = [];
    reactor.subscribeQuery(q, (res: any) => {
      if (res.data) seen.push(res.data);
    });

    // Initial full snapshot at version 10
    reactor._handleReceive('ws-1', {
      op: 'add-query-ok',
      q,
      version: 10,
      'processed-tx-id': 1,
      result: [
        {
          data: {
            'datalog-result': {
              'join-rows': [
                [
                  ['rec-1', recIdAttr, 'rec-1', 100],
                  ['rec-1', recTitleAttr, 'v1', 100],
                ],
              ],
            },
          },
          'child-nodes': [],
        },
      ],
    });
    expect(seen.at(-1).recordings[0].title).toBe('v1');

    // Delta from version 10 -> 11
    reactor._handleReceive('ws-1', {
      op: 'refresh-ok',
      'processed-tx-id': 2,
      computations: [
        {
          'instaql-query': q,
          version: 11,
          'instaql-delta': {
            'base-version': 10,
            added: [['rec-1', recTitleAttr, 'v2-delta', 200]],
            removed: [],
            'removed-entities': [],
          },
        },
      ],
    });
    expect(seen.at(-1).recordings[0].title).toBe('v2-delta');

    // Stale base-version mismatch (expects 99, client holds 11) -> resubscribe
    sent.length = 0;
    reactor._handleReceive('ws-1', {
      op: 'refresh-ok',
      'processed-tx-id': 3,
      computations: [
        {
          'instaql-query': q,
          version: 100,
          'instaql-delta': {
            'base-version': 99,
            added: [['rec-1', recTitleAttr, 'should-ignore', 300]],
            removed: [],
            'removed-entities': [],
          },
        },
      ],
    });
    expect(seen.at(-1).recordings[0].title).toBe('v2-delta');
    expect(sent.map((m) => m.op)).toEqual(['remove-query', 'add-query']);
    reactor.shutdown();
  });
});
