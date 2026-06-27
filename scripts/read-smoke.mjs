// Read-only live smoke test against a real HubSpot account.
// Token is read from env (never printed). Only READ operations are exercised.
import { HubSpotClient } from '../dist/hubspot-client.js';
import { getCrmTools } from '../dist/tools/crm/index.js';
import { getPropertiesTools } from '../dist/tools/properties/index.js';
import { getAssociationsTools } from '../dist/tools/associations/index.js';
import { getWorkflowsTools } from '../dist/tools/workflows/index.js';
import { getEnrollmentTools } from '../dist/tools/enrollment/index.js';

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error('No HUBSPOT_ACCESS_TOKEN in env');
  process.exit(1);
}
const client = new HubSpotClient({ accessToken: token });
const tools = Object.fromEntries(
  [
    ...getCrmTools(client),
    ...getPropertiesTools(client),
    ...getAssociationsTools(client),
    ...getWorkflowsTools(client),
    ...getEnrollmentTools(client),
  ].map((t) => [t.name, t])
);

let pass = 0;
let fail = 0;
function isErr(r) {
  return r && typeof r === 'object' && r.isError === true;
}
function summarize(r) {
  if (isErr(r)) {
    const txt = r.content?.[0]?.text ?? JSON.stringify(r);
    return 'ERROR: ' + String(txt).replace(/\s+/g, ' ').slice(0, 140);
  }
  if (r && Array.isArray(r.results)) {
    const cursor = r.pagination?.nextCursor ? ' +more' : '';
    return `results=${r.results.length}${cursor}`;
  }
  if (r && r.id) return `id=${r.id}`;
  const s = JSON.stringify(r);
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}
async function run(label, name, args) {
  const t = tools[name];
  if (!t) {
    console.log(`  ✗ ${label.padEnd(42)} (tool ${name} not found)`);
    fail++;
    return undefined;
  }
  try {
    const r = await t.handler(args);
    const ok = !isErr(r);
    console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(42)} ${summarize(r)}`);
    ok ? pass++ : fail++;
    return r;
  } catch (e) {
    console.log(`  ✗ ${label.padEnd(42)} THROW: ${String(e.message).slice(0, 120)}`);
    fail++;
    return undefined;
  }
}

const SALES = ['deals', 'line_items', 'products', 'quotes'];
const ENGAGEMENTS = ['calls', 'meetings', 'tasks', 'notes', 'emails'];

console.log('\n── CRM list (limit 3) ──');
const firstIds = {};
for (const ot of [...SALES, ...ENGAGEMENTS]) {
  const r = await run(`crm_list ${ot}`, 'hubspot_crm_list', { objectType: ot, limit: 3 });
  if (!isErr(r) && r?.results?.[0]?.id) firstIds[ot] = r.results[0].id;
}

console.log('\n── CRM get / batch_read / search (deals) ──');
if (firstIds.deals) {
  await run('crm_get deals[0]', 'hubspot_crm_get', { objectType: 'deals', id: firstIds.deals });
  await run('crm_batch_read deals', 'hubspot_crm_batch_read', {
    objectType: 'deals',
    inputs: [{ id: firstIds.deals }],
  });
}
await run('crm_search deals (recent)', 'hubspot_crm_search', {
  objectType: 'deals',
  limit: 3,
  sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
});

console.log('\n── Properties (list) ──');
for (const ot of ['deals', 'quotes', 'line_items', 'products', 'calls', 'meetings', 'tasks', 'notes', 'emails']) {
  await run(`properties_list ${ot}`, 'hubspot_properties_list', { objectType: ot });
}

console.log('\n── Associations (labels + list) ──');
await run('assoc_labels deals→contacts', 'hubspot_associations_labels_list', {
  fromType: 'deals',
  toType: 'contacts',
});
await run('assoc_labels deals→line_items', 'hubspot_associations_labels_list', {
  fromType: 'deals',
  toType: 'line_items',
});
if (firstIds.deals) {
  await run('assoc_list deal→line_items', 'hubspot_associations_list', {
    fromType: 'deals',
    fromId: firstIds.deals,
    toType: 'line_items',
  });
  await run('assoc_list deal→contacts', 'hubspot_associations_list', {
    fromType: 'deals',
    fromId: firstIds.deals,
    toType: 'contacts',
  });
}

console.log('\n── Workflows / Automation (read) ──');
const wf = await run('workflows_list (v4 flows)', 'hubspot_workflows_list', { limit: 5 });
if (!isErr(wf) && wf?.results?.[0]?.id) {
  const fid = wf.results[0].id;
  await run('workflows_get flows[0]', 'hubspot_workflows_get', { flowId: fid });
  await run('workflows_batch_read', 'hubspot_workflows_batch_read', { flowIds: [fid] });
  await run('workflows_email_campaigns', 'hubspot_workflows_email_campaigns', { flowId: fid });
}
await run('workflows_v3_list (legacy)', 'hubspot_workflows_v3_list', {});

console.log(`\n──────── RESULT: ${pass} OK / ${fail} fail ────────`);
