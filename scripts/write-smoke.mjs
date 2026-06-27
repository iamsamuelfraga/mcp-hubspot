// WRITE smoke test against a real HubSpot account. Authorized by the account owner.
// Everything created is prefixed "ZZZ-TEST-MCP" for easy review/cleanup.
// NO object is deleted/archived. Only association links are added AND removed (the
// requested "asignaciones y desasignaciones"). Token read from env (never printed).
import { HubSpotClient } from '../dist/hubspot-client.js';
import { getCrmTools } from '../dist/tools/crm/index.js';
import { getAssociationsTools } from '../dist/tools/associations/index.js';

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error('No HUBSPOT_ACCESS_TOKEN');
  process.exit(1);
}
const client = new HubSpotClient({ accessToken: token });
const tools = Object.fromEntries(
  [...getCrmTools(client), ...getAssociationsTools(client)].map((t) => [t.name, t])
);

const TAG = 'ZZZ-TEST-MCP';
const STAMP = new Date().toISOString();
const LOCALIZACION = '2-193735088';
const DEAL_PIPELINE = '2596906228';
const DEAL_STAGE = '3553674443';
const created = {}; // label -> { type, id }

const isErr = (r) => r && typeof r === 'object' && r.isError === true;
const errText = (r) => String(r?.content?.[0]?.text ?? JSON.stringify(r)).replace(/\s+/g, ' ').slice(0, 150);

async function tool(name, args) {
  const t = tools[name];
  if (!t) throw new Error(`tool ${name} not found`);
  return t.handler(args);
}
function logOk(label, extra = '') {
  console.log(`  ✓ ${label.padEnd(46)} ${extra}`);
}
function logFail(label, extra = '') {
  console.log(`  ✗ ${label.padEnd(46)} ${extra}`);
}

// ── Phase A: fixtures via raw client (objects outside the MCP objectType enum) ──
console.log('\n── A. Fixtures (company / contact / localización) [raw client] ──');
async function createRaw(label, type, properties, key) {
  try {
    const r = await client.post(`/crm/v3/objects/${type}`, { properties });
    created[key] = { type, id: r.id };
    logOk(label, `id=${r.id}`);
    return r.id;
  } catch (e) {
    logFail(label, e.message?.slice(0, 130));
    return undefined;
  }
}
await createRaw('create company', 'companies', { name: `${TAG} Empresa SL`, domain: 'zzz-test-mcp.example', city: 'Gijón' }, 'company');
await createRaw('create contact', 'contacts', { firstname: TAG, lastname: 'Persona', email: `zzz-test-mcp+${Date.now()}@example.com` }, 'contact');
await createRaw('create localización (custom obj)', LOCALIZACION, { nombre: `${TAG} Localización` }, 'localizacion');

// ── Phase B: in-scope objects via MCP tools ──
console.log('\n── B. Deal + Engagements [MCP tools] ──');
async function createMcp(label, objectType, properties, key) {
  const r = await tool('hubspot_crm_create', { objectType, properties });
  if (isErr(r)) {
    logFail(label, errText(r));
    return undefined;
  }
  created[key] = { type: objectType, id: r.id };
  logOk(label, `id=${r.id}`);
  return r.id;
}
await createMcp('crm_create deal', 'deals', { dealname: `${TAG} Negocio`, pipeline: DEAL_PIPELINE, dealstage: DEAL_STAGE, amount: '1500' }, 'deal');
await createMcp('crm_create note', 'notes', { hs_note_body: `${TAG} nota de prueba`, hs_timestamp: STAMP }, 'note');
await createMcp('crm_create task', 'tasks', { hs_task_subject: `${TAG} tarea`, hs_task_status: 'NOT_STARTED', hs_task_priority: 'HIGH', hs_timestamp: STAMP }, 'task');
await createMcp('crm_create call', 'calls', { hs_call_title: `${TAG} llamada`, hs_call_status: 'COMPLETED', hs_call_direction: 'OUTBOUND', hs_call_duration: '60000', hs_timestamp: STAMP }, 'call');
const end = new Date(Date.now() + 30 * 60000).toISOString();
await createMcp('crm_create meeting', 'meetings', { hs_meeting_title: `${TAG} reunión`, hs_meeting_start_time: STAMP, hs_meeting_end_time: end, hs_meeting_outcome: 'SCHEDULED', hs_timestamp: STAMP }, 'meeting');
await createMcp('crm_create email', 'emails', { hs_email_subject: `${TAG} email`, hs_email_direction: 'EMAIL', hs_email_status: 'SENT', hs_email_text: 'cuerpo de prueba', hs_timestamp: STAMP }, 'email');

// ── Phase C: associations (discover typeId via labels, then associate) ──
console.log('\n── C. Asociaciones [MCP tools: labels_list + associations_create] ──');
async function discoverTypeId(fromType, toType) {
  const r = await tool('hubspot_associations_labels_list', { fromType, toType });
  if (isErr(r)) return undefined;
  const first = (r.results || [])[0];
  if (!first) return undefined;
  return { category: first.category ?? 'HUBSPOT_DEFINED', typeId: first.typeId ?? first.associationTypeId };
}
async function associate(label, fromKey, toKey, toTypeOverride) {
  const from = created[fromKey];
  const to = toTypeOverride ? { type: toTypeOverride, id: created[toKey]?.id } : created[toKey];
  if (!from?.id || !to?.id) return logFail(label, 'falta fixture');
  const ti = await discoverTypeId(from.type, to.type);
  if (!ti?.typeId) return logFail(label, `sin typeId ${from.type}->${to.type}`);
  const r = await tool('hubspot_associations_create', {
    fromType: from.type, fromId: from.id, toType: to.type, toId: to.id,
    associationTypes: [{ associationCategory: ti.category, associationTypeId: ti.typeId }],
  });
  isErr(r) ? logFail(label, errText(r)) : logOk(label, `typeId=${ti.typeId}`);
}
await associate('deal ↔ contact', 'deal', 'contact');
await associate('deal ↔ company', 'deal', 'company');
await associate('deal ↔ localización', 'deal', 'localizacion');
await associate('note → deal', 'note', 'deal');
await associate('task → deal', 'task', 'deal');
await associate('call → contact', 'call', 'contact');
await associate('meeting → contact', 'meeting', 'contact');
await associate('email → deal', 'email', 'deal');

// ── Phase D: updates via MCP tools ──
console.log('\n── D. Updates [MCP tools: crm_update] ──');
async function update(label, key, properties) {
  const o = created[key];
  if (!o?.id) return logFail(label, 'falta objeto');
  const r = await tool('hubspot_crm_update', { objectType: o.type, id: o.id, properties });
  isErr(r) ? logFail(label, errText(r)) : logOk(label, 'updated');
}
await update('update deal (amount+stage)', 'deal', { amount: '2750', dealstage: '3553674445' });
await update('update task (-> COMPLETED)', 'task', { hs_task_status: 'COMPLETED' });
await update('update note (body)', 'note', { hs_note_body: `${TAG} nota EDITADA` });

// ── Phase E: disassociation (associate -> verify -> disassociate -> verify -> re-associate) ──
console.log('\n── E. Desasignación [MCP tools: associations_archive + list] ──');
async function countAssoc(fromKey, toType) {
  const from = created[fromKey];
  const r = await tool('hubspot_associations_list', { fromType: from.type, fromId: from.id, toType });
  return isErr(r) ? -1 : (r.results?.length ?? 0);
}
if (created.deal && created.contact) {
  const before = await countAssoc('deal', 'contacts');
  const r = await tool('hubspot_associations_archive', { fromType: 'deals', fromId: created.deal.id, toType: 'contacts', toId: created.contact.id });
  const after = await countAssoc('deal', 'contacts');
  if (!isErr(r) && after < before) logOk('disassociate deal ✗ contact', `links ${before} -> ${after}`);
  else logFail('disassociate deal ✗ contact', errText(r));
  // re-associate to leave a clean, fully-linked state for review
  await associate('re-associate deal ↔ contact', 'deal', 'contact');
}

// ── Summary ──
console.log('\n──────── OBJETOS CREADOS (para tu revisión / borrado) ────────');
for (const [k, v] of Object.entries(created)) {
  console.log(`  ${k.padEnd(13)} ${v.type.padEnd(14)} id=${v.id}`);
}
console.log(`\nTodos llevan el prefijo "${TAG}". Ninguno fue borrado/archivado.`);
