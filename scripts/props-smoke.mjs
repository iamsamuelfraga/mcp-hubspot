// Property-set smoke test — 100% through the MCP tools (crm_update, crm_get,
// properties_get). Targets the previously created ZZZ-TEST-MCP objects, now
// including company/contact/localización since the generic CRM layer is
// object-type agnostic. Enum values resolved via the MCP properties tool. No deletes.
import { HubSpotClient } from '../dist/hubspot-client.js';
import { getCrmTools } from '../dist/tools/crm/index.js';
import { getPropertiesTools } from '../dist/tools/properties/index.js';

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) { console.error('No token'); process.exit(1); }
const client = new HubSpotClient({ accessToken: token });
const tools = Object.fromEntries(
  [...getCrmTools(client), ...getPropertiesTools(client)].map((t) => [t.name, t])
);
const call = (name, args) => tools[name].handler(args);
const isErr = (r) => r && typeof r === 'object' && r.isError === true;
const errText = (r) => String(r?.content?.[0]?.text ?? JSON.stringify(r)).replace(/\s+/g, ' ').slice(0, 150);

const OBJ = {
  company:      { type: 'companies',   id: '435214711021' },
  contact:      { type: 'contacts',    id: '808658138313' },
  localizacion: { type: '2-193735088', id: '436835515581' },
  deal:         { type: 'deals',       id: '508317843674' },
  note:         { type: 'notes',       id: '500330224854' },
  task:         { type: 'tasks',       id: '500320827640' },
  call:         { type: 'calls',       id: '500406788341' },
  meeting:      { type: 'meetings',    id: '500387540187' },
  email:        { type: 'emails',      id: '500336752869' },
};

// Resolve a valid enum option via the MCP properties tool.
async function enumOption(objectType, prop, prefer) {
  const r = await call('hubspot_properties_get', { objectType, propertyName: prop });
  if (isErr(r)) return undefined;
  const opts = (r.options || []).filter((o) => !o.hidden).map((o) => o.value);
  return prefer && opts.includes(prefer) ? prefer : opts[0];
}

async function setProps(key, props) {
  const o = OBJ[key];
  const r = await call('hubspot_crm_update', { objectType: o.type, id: o.id, properties: props });
  if (isErr(r)) { console.log(`  ✗ ${key.padEnd(12)} ${errText(r)}`); return false; }
  console.log(`  ✓ ${key.padEnd(12)} [MCP crm_update] set: ${Object.keys(props).join(', ')}`);
  return true;
}

async function readBack(key, propNames) {
  const o = OBJ[key];
  const r = await call('hubspot_crm_get', { objectType: o.type, id: o.id, properties: propNames.join(',') });
  if (isErr(r)) { console.log(`     ↳ read err: ${errText(r)}`); return; }
  const shown = propNames.map((p) => `${p}=${JSON.stringify(r.properties?.[p] ?? null)}`).join('  ');
  console.log(`     ↳ [MCP crm_get] ${shown}`);
}

const TAG = 'ZZZ-TEST-MCP';
console.log('\n══ SET de propiedades — 100% vía tools MCP ══');

const lifecycle = await enumOption('contacts', 'lifecyclestage', 'lead');
const dealPriority = await enumOption('deals', 'hs_priority', 'high');
console.log(`(enums vía MCP properties_get) contacts.lifecyclestage="${lifecycle}"  deals.hs_priority="${dealPriority}"`);

console.log('\n── Empresa (texto, número, teléfono) ──');
await setProps('company', { name: `${TAG} Empresa SL`, city: 'Gijón', phone: '+34985000000', numberofemployees: '42', annualrevenue: '1500000', zip: '33207', description: `${TAG} descripción de empresa` });
await readBack('company', ['name', 'city', 'phone', 'numberofemployees', 'annualrevenue', 'zip']);

console.log('\n── Contacto (texto, enum lifecyclestage) ──');
await setProps('contact', { firstname: TAG, lastname: 'Persona', jobtitle: 'Responsable de pruebas', phone: '+34600111222', city: 'Oviedo', ...(lifecycle ? { lifecyclestage: lifecycle } : {}) });
await readBack('contact', ['firstname', 'lastname', 'jobtitle', 'phone', 'city', 'lifecyclestage']);

console.log('\n── Localización (custom object 2-193735088: texto) ──');
await setProps('localizacion', { nombre: `${TAG} Localización`, direccion: 'Calle Uría 1', ciudad: 'Oviedo', codigo_postal: '33003', codigo_externo: 'LOC-ZZZ-001' });
await readBack('localizacion', ['nombre', 'direccion', 'ciudad', 'codigo_postal', 'codigo_externo']);

console.log('\n── Negocio (texto, número, datetime, enum) ──');
const closeDate = new Date(Date.now() + 14 * 86400000).toISOString();
await setProps('deal', { dealname: `${TAG} Negocio (props)`, amount: '3999.50', description: `${TAG} descripción larga`, closedate: closeDate, ...(dealPriority ? { hs_priority: dealPriority } : {}) });
await readBack('deal', ['dealname', 'amount', 'description', 'closedate', 'hs_priority']);

console.log('\n── Actividades (propiedades específicas por tipo) ──');
await setProps('note', { hs_note_body: `${TAG} nota con <b>HTML</b> editada` });
await readBack('note', ['hs_note_body']);
await setProps('task', { hs_task_subject: `${TAG} tarea actualizada`, hs_task_priority: 'HIGH', hs_task_status: 'IN_PROGRESS', hs_task_body: 'detalle' });
await readBack('task', ['hs_task_subject', 'hs_task_priority', 'hs_task_status']);
await setProps('call', { hs_call_title: `${TAG} llamada actualizada`, hs_call_body: 'resumen', hs_call_duration: '125000', hs_call_direction: 'INBOUND' });
await readBack('call', ['hs_call_title', 'hs_call_duration', 'hs_call_direction']);
await setProps('meeting', { hs_meeting_title: `${TAG} reunión actualizada`, hs_meeting_location: 'Oficina Oviedo', hs_meeting_body: 'agenda', hs_meeting_outcome: 'COMPLETED' });
await readBack('meeting', ['hs_meeting_title', 'hs_meeting_location', 'hs_meeting_outcome']);
await setProps('email', { hs_email_subject: `${TAG} email actualizado`, hs_email_text: 'cuerpo editado' });
await readBack('email', ['hs_email_subject', 'hs_email_direction']);

console.log('\n✔ Todo ejecutado a través de las tools del MCP (crm_update / crm_get / properties_get). Nada borrado.');
