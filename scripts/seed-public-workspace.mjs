#!/usr/bin/env node
/**
 * seed-public-workspace.mjs
 *
 * Seeds a public workspace with the graphMock=1 dataset.
 * Works against the Firestore emulator (default) or production via service account.
 *
 * Usage (emulator):
 *   node scripts/seed-public-workspace.mjs
 *
 * Usage (production with service account):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   GCLOUD_PROJECT=my-project \
 *   USE_PROD=1 \
 *   node scripts/seed-public-workspace.mjs
 *
 * Options (env vars):
 *   FIRESTORE_EMULATOR_HOST  Emulator host:port  (default: localhost:8081)
 *   GCLOUD_PROJECT           Firebase project ID  (default: local-dev)
 *   WORKSPACE_ID             Override workspace ID (default: ws-mock-public)
 *   TOPIC_ID                 Override topic ID     (default: topic-mock-1)
 *   OWNER_UID                UID to set as owner   (default: seed-script)
 */

import { randomUUID } from 'crypto';

// ── Config ───────────────────────────────────────────────────────────────────
const EMULATOR_HOST  = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8081';
const PROJECT        = process.env.GCLOUD_PROJECT ?? 'local-dev';
const USE_PROD       = process.env.USE_PROD === '1';
const WORKSPACE_ID   = process.env.WORKSPACE_ID ?? 'ws-mock-public';
const TOPIC_ID       = process.env.TOPIC_ID     ?? 'topic-mock-1';
const OWNER_UID      = process.env.OWNER_UID    ?? 'seed-script';

const BASE_URL = USE_PROD
  ? `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
  : `http://${EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── Firestore REST helpers ───────────────────────────────────────────────────
function sv(s) { return { stringValue: s }; }
function bv(b) { return { booleanValue: b }; }
function nv()  { return { nullValue: 'NULL_VALUE' }; }

async function upsertDoc(path, fields) {
  const url = `${BASE_URL}/${path}?updateMask.fieldPaths=${Object.keys(fields).join('&updateMask.fieldPaths=')}`;
  const body = JSON.stringify({ fields });
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// Batch write via Firestore REST commit
async function commitBatch(writes) {
  const url = `${BASE_URL}:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`commit → ${res.status}: ${text}`);
  }
  return res.json();
}

function docPath(path) {
  return `projects/${PROJECT}/databases/(default)/documents/${path}`;
}

function write(path, fields) {
  return {
    update: {
      name: docPath(path),
      fields,
    },
  };
}

// ── Mock data (mirrors persistedGraphMockHundred.ts) ────────────────────────
const ROOTS = [
  { id: 'topic:systems',    label: 'Systems Transition', summary: 'Large-scale systems change across infrastructure and institutions.' },
  { id: 'topic:industry',   label: 'Industrial Shift',   summary: 'Operational change in heavy industry, logistics, and materials.' },
  { id: 'topic:public',     label: 'Public Capacity',    summary: 'Administrative, community, and delivery capability for execution.' },
  { id: 'topic:resilience', label: 'Resilience',         summary: 'Reliability, redundancy, and adaptation under stress.' },
];

const CLUSTER_LABELS = [
  ['Policy Design', 'Grid Delivery', 'Permitting Flow', 'Capital Programs'],
  ['Process Heat',  'Materials Supply', 'Fleet Conversion', 'Factory Learning'],
  ['Training Systems', 'Community Trust', 'Local Governance', 'Service Ops'],
  ['Buffers & Redundancy', 'Critical Inputs', 'Emergency Response', 'Interoperability'],
];

const SUBCLUSTER_LABELS = [
  ['Market Signals', 'Implementation'],
  ['Bottlenecks', 'Upgrades'],
  ['Coordination', 'Traceability'],
  ['Execution', 'Metrics'],
];

function buildMockNodes(topicId) {
  const nodes = [];

  for (const root of ROOTS) {
    nodes.push({ id: root.id, label: root.label, kind: 'topic', parentId: null, contextSummary: root.summary });
  }

  ROOTS.forEach((root, rootIndex) => {
    CLUSTER_LABELS[rootIndex].forEach((clusterLabel, clusterIndex) => {
      const clusterId = `cluster:${rootIndex}:${clusterIndex}`;
      nodes.push({
        id: clusterId,
        label: clusterLabel,
        kind: 'cluster',
        parentId: root.id,
        contextSummary: `${clusterLabel} controls how ${root.label.toLowerCase()} becomes executable work.`,
      });

      SUBCLUSTER_LABELS[clusterIndex].forEach((subclusterLabel, subclusterIndex) => {
        const subclusterId = `subcluster:${rootIndex}:${clusterIndex}:${subclusterIndex}`;
        nodes.push({
          id: subclusterId,
          label: subclusterLabel,
          kind: 'subcluster',
          parentId: clusterId,
          contextSummary: `${subclusterLabel} shapes how ${clusterLabel.toLowerCase()} gets coordinated in practice.`,
        });

        const claimCount = subclusterIndex === 0 ? 2 : 1;
        for (let claimIndex = 0; claimIndex < claimCount; claimIndex++) {
          const claimId = `claim:${rootIndex}:${clusterIndex}:${subclusterIndex}:${claimIndex}`;
          const claimLabel = claimIndex === 0
            ? `${subclusterLabel} drives throughput`
            : `${subclusterLabel} reveals hidden delays`;
          nodes.push({
            id: claimId,
            label: claimLabel,
            kind: 'claim',
            parentId: subclusterId,
            contextSummary: `${claimLabel} within ${clusterLabel.toLowerCase()} depends on repeated operational choices and local constraints.`,
          });
        }
      });
    });
  });

  return nodes;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding public workspace`);
  console.log(`  Project:     ${PROJECT}`);
  console.log(`  Target:      ${USE_PROD ? 'PRODUCTION' : `emulator (${EMULATOR_HOST})`}`);
  console.log(`  Workspace:   ${WORKSPACE_ID}`);
  console.log(`  Topic:       ${TOPIC_ID}`);
  console.log(`  Owner UID:   ${OWNER_UID}`);
  console.log('');

  const now = new Date().toISOString();
  const nodes = buildMockNodes(TOPIC_ID);

  // Build all writes
  const writes = [];

  // Workspace doc
  writes.push(write(`workspaces/${WORKSPACE_ID}`, {
    workspaceId: sv(WORKSPACE_ID),
    name:        sv('Mock Public Workspace'),
    createdBy:   sv(OWNER_UID),
    visibility:  sv('public'),
    status:      sv('active'),
  }));

  // Owner member doc
  writes.push(write(`workspaces/${WORKSPACE_ID}/members/${OWNER_UID}`, {
    uid:  sv(OWNER_UID),
    role: sv('owner'),
  }));

  // Topic doc
  writes.push(write(`workspaces/${WORKSPACE_ID}/topics/${TOPIC_ID}`, {
    workspaceId:           sv(WORKSPACE_ID),
    topicId:               sv(TOPIC_ID),
    title:                 sv('Mock Topic'),
    status:                sv('active'),
    latestDraftVersion:    { integerValue: '0' },
    latestOutlineVersion:  { integerValue: '0' },
    schemaVersion:         { integerValue: '0' },
  }));

  // Node docs
  for (const node of nodes) {
    const fields = {
      nodeId:         sv(node.id),
      title:          sv(node.label),
      kind:           sv(node.kind),
      contextSummary: sv(node.contextSummary),
      contentMd:      sv(`# ${node.label}\n\n${node.contextSummary}`),
      topicId:        sv(TOPIC_ID),
      workspaceId:    sv(WORKSPACE_ID),
      updatedAt:      sv(now),
    };
    if (node.parentId) {
      fields.parentId = sv(node.parentId);
    }
    writes.push(write(`workspaces/${WORKSPACE_ID}/topics/${TOPIC_ID}/nodes/${node.id}`, fields));
  }

  // Commit in batches of 500 (Firestore limit)
  const BATCH_SIZE = 500;
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writes.slice(i, i + BATCH_SIZE);
    await commitBatch(batch);
    console.log(`  wrote ${Math.min(i + BATCH_SIZE, writes.length)}/${writes.length} documents`);
  }

  console.log('\nDone!');
  console.log(`  Open: /workspace/${WORKSPACE_ID}?topicId=${TOPIC_ID}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
