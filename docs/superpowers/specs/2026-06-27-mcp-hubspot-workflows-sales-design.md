# MCP HubSpot — Workflows & Sales API (Enterprise-grade) — Design

- **Fecha:** 2026-06-27
- **Estado:** Aprobado para implementación
- **Autor:** Samuel Fraga (con Claude Code)
- **Alcance:** Implementación completa de HubSpot Sales (Core CRM + Engagements) + Automation/Workflows, como servidor MCP enterprise-grade.

## 1. Objetivo

Servidor MCP (Model Context Protocol) para HubSpot que cubre, con calidad enterprise (rate-limiting, retry/backoff, paginación, batch, validación Zod, logging, tests con cobertura, packaging publicable), las siguientes superficies de API:

- **Sales — Core CRM:** Deals, Line Items, Products, Quotes.
- **Sales — Engagements:** Calls, Meetings, Tasks, Notes, Emails.
- **Transversal:** Associations v4, Properties.
- **Automation/Workflows:** Flows v4 (CRUD completo), email-campaigns, performance, id-mappings, Callbacks v4, Enrollment v2, lectura Workflows v3.
- **Opcional (Fase 7):** Custom Action *definitions* v4 (requiere developer API key).

## 2. Decisiones tomadas

| Decisión | Elección |
|---|---|
| Auth | **Private App token** (`Authorization: Bearer`), single-tenant. Var entorno `HUBSPOT_ACCESS_TOKEN`. |
| Granularidad de tools | **Híbrido**: tools CRM genéricas parametrizadas por `objectType` + tools dedicadas para lo no-uniforme. ~36 tools núcleo. |
| Custom Action definitions | **Fase 7 opcional** (requiere `HUBSPOT_DEVELOPER_API_KEY` y appId; auth distinta). |
| Stack | TS ESM, `@modelcontextprotocol/sdk`, `zod`, `bottleneck`, `winston`, `vitest`+coverage, `husky`/`eslint`/`prettier`/`semantic-release`. Espejo de `mcp-pipedrive`. |
| Node | `>=20.18.0`. |

## 3. Stack y convenciones (espejo de mcp-pipedrive)

- **Módulos:** ESM (`"type": "module"`), imports con extensión `.js`.
- **Validación:** Zod por cada input de tool. Cada tool: `{ name, description, inputSchema (JSON Schema derivado de Zod), handler }`.
- **Cliente HTTP:** `fetch` nativo (Node 20), wrapper `HubSpotClient` con Bearer, baseURL `https://api.hubapi.com`, integra rate-limiter + retry + parsing de error model.
- **Errores:** mapear el modelo de error de HubSpot a un `HubSpotApiError` tipado; nunca filtrar el token en logs/errores.
- **Logging:** `winston` a stderr (stdout reservado para el transporte MCP stdio).
- **Tests:** `vitest`, mock del cliente HTTP, objetivo de cobertura alto (>90% en utils y client).

### Estructura de directorios
```
src/
  index.ts                 # bootstrap MCP, ListTools/CallTool, toolset-filter, env validation
  hubspot-client.ts        # fetch+Bearer, baseURL, rate-limit, retry, paginación, batch helpers
  types/
    hubspot-api.ts         # tipos de respuesta comunes (Paging, BatchResponse, ErrorModel...)
    common.ts
  utils/
    logger.ts              # winston -> stderr
    error-handler.ts       # HubSpotApiError + mapeo modelo error + handleToolError
    rate-limiter.ts        # bottleneck (190/10s configurable; search bucket más estricto)
    retry.ts               # backoff exponencial para 429/5xx (sin depender de Retry-After)
    pagination.ts          # iterar paging.next.after
    batch.ts               # trocear inputs en lotes de 100
    metrics.ts             # contadores de llamadas/errores
    toolset-filter.ts      # HUBSPOT_TOOLSETS -> habilitar dominios
    object-types.ts        # registro de objectTypes CRM válidos + scopes + paths
  schemas/
    common.ts              # paginación, filtros search, batch inputs
    crm-objects.ts         # propiedades por objeto (deals, line_items, products, quotes)
    engagements.ts         # propiedades por tipo (calls, meetings, tasks, notes, emails)
    associations.ts
    properties.ts
    workflows.ts           # schema recursivo de Flows v4 (PublicOrFilterBranch, actions, etc.)
    enrollment.ts
  tools/
    crm/index.ts           # capa genérica: list/get/create/update/archive/search/batch*
    sales/index.ts         # deals_merge, quotes_assemble
    associations/index.ts
    properties/index.ts
    workflows/index.ts
    automation/index.ts    # callbacks complete/batch
    enrollment/index.ts    # v2 enroll/unenroll/get + v3 read
  resources/index.ts
  prompts/index.ts
  __tests__/...
```

### Patrón de cada módulo de tools
Cada `tools/<dominio>/index.ts` exporta `get<Dominio>Tools(client: HubSpotClient): Tool[]`. `index.ts` agrega todas y aplica el toolset-filter.

## 4. Inventario de operaciones (verificado contra specs OpenAPI oficiales)

Base host: `https://api.hubapi.com`.

### 4.1 CRM uniforme — patrón compartido
Para cada `objectType`, mismas operaciones:

| Op | Método | Path |
|---|---|---|
| list | GET | `/crm/v3/objects/{type}` (`limit`≤100, `after`, `properties`, `associations`, `archived`) |
| get | GET | `/crm/v3/objects/{type}/{id}` |
| create | POST | `/crm/v3/objects/{type}` (`{ properties, associations }`) |
| update | PATCH | `/crm/v3/objects/{type}/{id}` |
| archive | DELETE | `/crm/v3/objects/{type}/{id}` (soft-delete) |
| search | POST | `/crm/v3/objects/{type}/search` (`filterGroups`≤5, ≤6 filtros/grupo, `limit`≤200, ≤10k resultados) |
| batch create | POST | `/crm/v3/objects/{type}/batch/create` (≤100) |
| batch read | POST | `/crm/v3/objects/{type}/batch/read` (≤100, soporta `idProperty`) |
| batch update | POST | `/crm/v3/objects/{type}/batch/update` (≤100) |
| batch archive | POST | `/crm/v3/objects/{type}/batch/archive` (≤100) |
| batch upsert | POST | `/crm/v3/objects/{type}/batch/upsert` (≤100, requiere `idProperty`) |

**objectTypes soportados:** `deals`, `line_items`, `products`, `quotes`, `calls`, `meetings`, `tasks`, `notes`, `emails`.

**Scopes por objeto:**
- deals: `crm.objects.deals.read` / `.write`
- line_items / products / quotes: `crm.objects.{line_items|products|quotes}.read` / `.write` (alternativa legacy: `e-commerce`)
- engagements (calls/meetings/tasks/notes/emails): `crm.objects.contacts.read` / `.write`; emails además `sales-email-read` para leer contenido.

### 4.2 Sales — especiales
- **Deals merge:** `POST /crm/v3/objects/deals/merge`.
- **Quotes assemble** (helper de alto nivel): crea quote + asocia deal + line items + template + owner. (`hs_status`: DRAFT → …)

### 4.3 Engagements — propiedades clave
Comunes: `hs_timestamp` (requerido en create), `hubspot_owner_id`.
- Calls: `hs_call_title`, `hs_call_body`, `hs_call_duration`, `hs_call_direction`, `hs_call_status`, `hs_call_disposition`, `hs_call_from_number`, `hs_call_to_number`, `hs_call_recording_url`.
- Meetings: `hs_meeting_title`, `hs_meeting_body`, `hs_meeting_start_time`, `hs_meeting_end_time`, `hs_meeting_location`, `hs_meeting_outcome`.
- Tasks: `hs_task_subject`, `hs_task_body`, `hs_task_status`, `hs_task_priority`, `hs_task_type` (`hs_timestamp` = due date).
- Notes: `hs_note_body`, `hs_attachment_ids`.
- Emails: `hs_email_direction`, `hs_email_status`, `hs_email_subject`, `hs_email_text`, `hs_email_html`, `hs_email_headers`.

### 4.4 Associations v4
- Individual: `PUT /crm/v4/objects/{fromType}/{fromId}/associations/{toType}/{toId}` (body con tipos); `DELETE` análogo.
- Batch: `POST /crm/v4/associations/{fromType}/{toType}/batch/{create|read|archive}`.
- Labels: `GET /crm/v4/associations/{fromType}/{toType}/labels`.
- Inline en create: array `associations` en el `POST /crm/v3/objects/{type}`.
- Defaults engagement→objeto (HUBSPOT_DEFINED typeIds): Call→Contact 194/Company 182/Deal 206/Ticket 220; Email 198/186/210/224; Meeting 200/188/212/226; Note 202/190/214/228; Task 204/192/216/230. **Verificar en runtime con el endpoint de labels** (pueden variar por portal).

### 4.5 Properties
- `GET /crm/v3/properties/{objectType}` (list), `GET /{propertyName}`, `POST` (create), `PATCH`, `DELETE`, `/batch/read`, `/batch/create`.
- En list/get/batch hay que pedir `?properties=` explícitamente.

### 4.6 Workflows / Automation v4 (Flows) — **BETA**
| Op | Método | Path |
|---|---|---|
| list | GET | `/automation/v4/flows` (`limit`, `after`) |
| get | GET | `/automation/v4/flows/{flowId}` |
| create | POST | `/automation/v4/flows` |
| update | PUT | `/automation/v4/flows/{flowId}` |
| delete | DELETE | `/automation/v4/flows/{flowId}` (irreversible vía API) |
| batch read | POST | `/automation/v4/flows/batch/read` (`inputs[].flowId`) |
| email campaigns | GET | `/automation/v4/flows/email-campaigns` (`flowId`) |
| performance | GET | `/automation/v4/flows/performance/{flowId}` |
| id mappings | POST | `/automation/v4/workflow-id-mappings/batch/read` |

Scope: `automation`. La colección Postman de referencia (proporcionada por el usuario) se guarda en `docs/reference/automation-v4-workflows.postman_collection.json`.

**Schema de Flow (clave, recursivo):** `type` (`CONTACT_FLOW`…), `flowType` (`WORKFLOW`/`ACTION_SET`/`UNKNOWN`), `isEnabled`, `objectTypeId`, `startActionId`, `actions[]` (con `STATIC_BRANCH`, `inputValue`, `staticBranches[].connection`, `defaultBranch`), `enrollmentCriteria` (`listFilterBranch`/`reEnrollmentTriggersFilterBranches` → **`PublicOrFilterBranch`** recursivo: `filterBranchType` OR/AND, `filterBranches[]` anidados, `filters[]` con `filterType`/`operation`/`property`), `enrollmentSchedule`, `goalFilterBranch`, `eventAnchor`, `timeWindows[]`, `blockedDates[]`, `suppressionListIds[]`, `dataSources[]`, `unEnrollmentSetting`, `customProperties`. Modelar `PublicOrFilterBranch` con `z.lazy()`.

### 4.7 Automation runtime + Enrollment
| Op | Método | Path | Scope |
|---|---|---|---|
| callback complete | POST | `/automation/v4/actions/callbacks/{callbackId}/complete` | `automation` |
| callback complete batch | POST | `/automation/v4/actions/callbacks/complete` | `automation` |
| enroll contact | POST | `/automation/v2/workflows/{workflowId}/enrollments/contacts/{email}` | `automation` |
| unenroll contact | DELETE | `/automation/v2/workflows/{workflowId}/enrollments/contacts/{email}` | `automation` |
| get enrollments | GET | `/automation/v2/enrollments/contacts/{vid}` | `automation` |
| v3 workflows read | GET | `/automation/v3/workflows` y `/{workflowId}` | `automation` |

`hs_execution_state` en callbacks: `SUCCESS` / `FAIL_CONTINUE` / `BLOCK`.

### 4.8 Custom Action definitions (Fase 7, opcional)
`/automation/v4/actions/{appId}` (+ `/{definitionId}`, `/revisions`, `/functions/{functionType}`, `/requires-object`). **Auth: developer API key** (`developers-read`/`developers-write`), no el private app token.

## 5. Convenciones de plataforma

- **Rate limits:** 190 req/10s (Pro/Ent) / 100 (Free/Starter); diario 625k–1M según tier. `429` con `policyName` (`DAILY`/`SECONDLY`); **sin `Retry-After` garantizado** → backoff exponencial propio. Headers `X-HubSpot-RateLimit-*` cuando existen.
- **Search:** bucket más estricto (~5 req/s/token), **sin headers de rate-limit**, latencia de indexación de segundos. Rate-limiter con reservoir dedicado para `/search`.
- **Paginación:** `paging.next.after` + `limit`. Legacy v2 usa `offset`/`has-more` (distinto).
- **Modelo de error:** `{ status, message, correlationId, category, subCategory?, errors[]{message,code,context}, context?, links? }`. Tratar todos los campos como opcionales. Categorías: `VALIDATION_ERROR`, `RATE_LIMIT`, `MISSING_SCOPES`, `OBJECT_NOT_FOUND`, etc.

## 6. Superficie de tools (núcleo ≈ 36)

CRM genéricas (11): `hubspot_crm_list`, `_get`, `_create`, `_update`, `_archive`, `_search`, `_batch_create`, `_batch_read`, `_batch_update`, `_batch_archive`, `_batch_upsert` (todas con `objectType` enum).
Sales (2): `hubspot_deals_merge`, `hubspot_quotes_assemble`.
Associations (5): `_create`, `_archive`, `_list`, `_batch_create`, `_labels_list`.
Properties (3): `_list`, `_get`, `_create`.
Workflows v4 (9): `_list`, `_get`, `_batch_read`, `_create`, `_update`, `_delete`, `_email_campaigns`, `_performance`, `_id_mappings`.
Automation (2): `_callback_complete`, `_callback_complete_batch`.
Enrollment/v3 (4): `_enroll`, `_unenroll`, `_get_enrollments`, `_workflows_v3_list`.

Toolset-filter: `HUBSPOT_TOOLSETS=sales,engagements,associations,properties,workflows,automation` (default: todos).

## 7. Plan de fases

| Fase | Contenido | Pts | Riesgo |
|---|---|---:|---|
| 0 | Fundaciones: scaffolding, `HubSpotClient`, utils (rate-limit/retry/paginación/batch/error-model/toolset-filter/object-types), bootstrap MCP, CI | 8 | Bajo |
| 1 | Sales core: capa CRM genérica + Zod (deals, line_items, products, quotes) + `deals_merge` + `quotes_assemble` + tests | 8 | Medio |
| 2 | Engagements (5 tipos) + props por tipo + asociaciones default + tests | 5 | Bajo |
| 3 | Associations v4 + Properties + tests | 5 | Bajo-Medio |
| 4 | Workflows v4 flows (schema recursivo) + CRUD + email-campaigns + performance + id-mappings + tests | 13 | **Alto** |
| 5 | Automation runtime (callbacks) + Enrollment v2 + lectura v3 + tests | 5 | Medio |
| 6 | DX/packaging: resources + prompts + README + server.json/manifest + SECURITY/CONTRIBUTING + publish + gate cobertura | 5 | Bajo |
| 7 *(opc.)* | Custom Action definitions (developer API key) | 8 | Medio |

**Total núcleo (0–6): 49 pts ≈ 17.5 días ideales.**

### Secuencia / dependencias
- 0 → (1, 2, 3 dependen del cliente/capa genérica) → 1 habilita 2; 3 habilita flujos reales de quotes/engagements.
- 4 y 5 independientes del bloque CRM (solo dependen de Fase 0).
- 6 integra todo y empaqueta.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Flows v4 BETA + schema recursivo | Aislar `PublicOrFilterBranch` con `z.lazy()`, tests dedicados, tolerar campos desconocidos (passthrough controlado) |
| `429` sin `Retry-After` | Backoff exponencial con jitter; bucket dedicado para search |
| Latencia de indexación de search | Documentar en descripción de la tool; no usar search para read-after-write inmediato |
| Split de auth (definitions) | Aislar en Fase 7 con credencial separada y toolset propio |
| Asociaciones por portal | Descubrir labels en runtime, no hardcodear typeIds salvo defaults |
| Fuga de token | `winston` redaction; nunca loggear headers Authorization |

## 9. Definición de "hecho" por fase
- Tipos y Zod completos del dominio.
- Tools registradas y filtrables.
- Tests unitarios con mock del cliente (happy path + error + validación).
- `tsc --noEmit`, `eslint`, `prettier --check` en verde.
- Documentación mínima de las tools en README.
