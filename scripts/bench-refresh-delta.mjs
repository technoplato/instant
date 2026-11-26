#!/usr/bin/env node
/**
 * Measures InstantDB refresh-ok wire payload & client store update latency:
 *   Baseline: full instaql-result (re-sent on every refresh) + createStore()
 *   Experiment: instaql-delta (incremental triples-delta) + applyTriplesDelta()
 *
 * Workload models DEATH append-only log streams and Scribe live transcription
 * (N existing rows, 100 consecutive streaming word/message appends).
 */
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Run with: node --experimental-strip-types or vitest / bun
import * as s from '../client/packages/core/src/store.ts';
import query from '../client/packages/core/src/instaql.ts';

const ATTRS = {
  'a-id': {
    id: 'a-id',
    'forward-identity': ['f1', 'messages', 'id'],
    'value-type': 'blob',
    cardinality: 'one',
    'primary?': true,
  },
  'a-seq': {
    id: 'a-seq',
    'forward-identity': ['f2', 'messages', 'seq'],
    'value-type': 'blob',
    cardinality: 'one',
  },
  'a-payload': {
    id: 'a-payload',
    'forward-identity': ['f3', 'messages', 'payload'],
    'value-type': 'blob',
    cardinality: 'one',
  },
  'a-host': {
    id: 'a-host',
    'forward-identity': ['f4', 'messages', 'host'],
    'value-type': 'blob',
    cardinality: 'one',
  },
  'a-ts': {
    id: 'a-ts',
    'forward-identity': ['f5', 'messages', 'createdAtMs'],
    'value-type': 'blob',
    cardinality: 'one',
  },
};

function rowTriples(i) {
  const id = `msg-${String(i).padStart(6, '0')}`;
  const ts = 1_700_000_000_000 + i * 100;
  return [
    [id, 'a-id', id, ts],
    [id, 'a-seq', i, ts],
    [id, 'a-payload', `AddBook:{"id":"${id}","title":"Volume ${i}"}`, ts],
    [id, 'a-host', 'swift', ts],
    [id, 'a-ts', ts, ts],
  ];
}

function bench(baseRows, steps) {
  const attrsStore = new s.AttrsStoreClass(ATTRS, null);
  const allTriples = [];
  for (let i = 0; i < baseRows; i++) {
    allTriples.push(...rowTriples(i));
  }

  let baseBytes = 0;
  let deltaBytes = 0;

  // Baseline: full refresh-ok + createStore per append
  const baselineTriples = allTriples.slice();
  let baselineStore = s.createStore(attrsStore, baselineTriples, false, false);
  const t0 = performance.now();
  for (let step = 0; step < steps; step++) {
    const added = rowTriples(baseRows + step);
    baselineTriples.push(...added);
    const frame = JSON.stringify({
      op: 'refresh-ok',
      computations: [
        {
          'instaql-query': { messages: {} },
          'instaql-result': [
            {
              data: { 'datalog-result': { 'join-rows': [baselineTriples] } },
              'child-nodes': [],
            },
          ],
        },
      ],
    });
    baseBytes += Buffer.byteLength(frame, 'utf8');
    const parsed = JSON.parse(frame);
    const triples =
      parsed.computations[0]['instaql-result'][0].data['datalog-result'][
        'join-rows'
      ][0];
    baselineStore = s.createStore(attrsStore, triples, false, false);
  }
  const baselineMs = performance.now() - t0;

  // Experiment: refresh-delta + applyTriplesDelta per append
  let deltaStore = s.createStore(attrsStore, allTriples, false, false);
  const t1 = performance.now();
  for (let step = 0; step < steps; step++) {
    const added = rowTriples(baseRows + step);
    const frame = JSON.stringify({
      op: 'refresh-ok',
      computations: [
        {
          'instaql-query': { messages: {} },
          version: step + 2,
          'instaql-delta': {
            'base-version': step + 1,
            added,
            removed: [],
            'removed-entities': [],
          },
        },
      ],
    });
    deltaBytes += Buffer.byteLength(frame, 'utf8');
    const parsed = JSON.parse(frame);
    const delta = parsed.computations[0]['instaql-delta'];
    deltaStore = s.applyTriplesDelta(deltaStore, attrsStore, delta);
  }
  const deltaMs = performance.now() - t1;

  // Correctness check: identical final row count
  const q = { messages: {} };
  const baseCount = query({ store: baselineStore, attrsStore }, q).data.messages
    .length;
  const deltaCount = query({ store: deltaStore, attrsStore }, q).data.messages
    .length;
  if (baseCount !== deltaCount || baseCount !== baseRows + steps) {
    throw new Error(`Mismatch: base=${baseCount} delta=${deltaCount}`);
  }

  return {
    baseRows,
    steps,
    baselineTotalBytes: baseBytes,
    deltaTotalBytes: deltaBytes,
    bytesReductionPct: Number(
      (((baseBytes - deltaBytes) / baseBytes) * 100).toFixed(2),
    ),
    baselineMs: Number(baselineMs.toFixed(2)),
    deltaMs: Number(deltaMs.toFixed(2)),
    speedupX: Number((baselineMs / Math.max(deltaMs, 0.01)).toFixed(1)),
  };
}

const results = [bench(1000, 50), bench(5000, 25), bench(10000, 10)];
console.log(JSON.stringify(results, null, 2));
