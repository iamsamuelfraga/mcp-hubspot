/**
 * Unit tests for HubSpot Automation v4 Workflows Zod schemas.
 *
 * Focuses on:
 * - Recursive PublicOrFilterBranchSchema (z.lazy() correctness)
 * - FlowSchema structural validation
 * - .passthrough() behavior for BETA unknown fields
 */
import { describe, it, expect } from 'vitest';
import { PublicOrFilterBranchSchema, FlowSchema } from '../schemas/workflows.js';

// ---------------------------------------------------------------------------
// PublicOrFilterBranchSchema
// ---------------------------------------------------------------------------

describe('PublicOrFilterBranchSchema', () => {
  it('parses a flat (level 0) filter branch with no nested branches', () => {
    const input = {
      filterBranchType: 'OR',
      filterBranches: [],
      filters: [
        {
          filterType: 'PROPERTY',
          operation: { operator: 'EQ', value: 'subscriber' },
          property: 'hs_email_optout',
        },
      ],
    };

    const result = PublicOrFilterBranchSchema.parse(input);

    expect(result.filterBranchType).toBe('OR');
    expect(result.filterBranches).toHaveLength(0);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].filterType).toBe('PROPERTY');
    expect(result.filters[0].property).toBe('hs_email_optout');
  });

  it('parses a 2-level nested structure: OR → AND → filter', () => {
    const input = {
      filterBranchType: 'OR',
      filterBranches: [
        {
          filterBranchType: 'AND',
          filterBranches: [],
          filters: [
            {
              filterType: 'PROPERTY',
              operation: { operator: 'EQ', value: 'customer' },
              property: 'lifecyclestage',
            },
          ],
        },
      ],
      filters: [],
    };

    const result = PublicOrFilterBranchSchema.parse(input);

    // Level 0 (OR)
    expect(result.filterBranchType).toBe('OR');
    expect(result.filterBranches).toHaveLength(1);
    expect(result.filters).toHaveLength(0);

    // Level 1 (AND)
    const andBranch = result.filterBranches[0];
    expect(andBranch.filterBranchType).toBe('AND');
    expect(andBranch.filterBranches).toHaveLength(0);
    expect(andBranch.filters).toHaveLength(1);
    expect(andBranch.filters[0].filterType).toBe('PROPERTY');
    expect(andBranch.filters[0].property).toBe('lifecyclestage');
  });

  it('parses 3-level deep nesting: OR → AND → OR → filter (proves full recursion)', () => {
    const input = {
      filterBranchType: 'OR',
      filterBranches: [
        {
          filterBranchType: 'AND',
          filterBranches: [
            {
              filterBranchType: 'OR',
              filterBranches: [],
              filters: [
                {
                  filterType: 'LIST_MEMBERSHIP',
                  operation: { operator: 'IN_LIST', listId: '42' },
                },
              ],
            },
          ],
          filters: [],
        },
      ],
      filters: [],
    };

    const result = PublicOrFilterBranchSchema.parse(input);

    // Level 0
    expect(result.filterBranchType).toBe('OR');
    expect(result.filterBranches).toHaveLength(1);

    // Level 1
    const level1 = result.filterBranches[0];
    expect(level1.filterBranchType).toBe('AND');
    expect(level1.filterBranches).toHaveLength(1);

    // Level 2
    const level2 = level1.filterBranches[0];
    expect(level2.filterBranchType).toBe('OR');
    expect(level2.filterBranches).toHaveLength(0);
    expect(level2.filters).toHaveLength(1);
    expect(level2.filters[0].filterType).toBe('LIST_MEMBERSHIP');
  });

  it('rejects an invalid filterBranchType value', () => {
    const input = {
      filterBranchType: 'INVALID_TYPE',
      filterBranches: [],
      filters: [],
    };

    expect(() => PublicOrFilterBranchSchema.parse(input)).toThrow();
  });

  it('preserves unknown (BETA) fields via passthrough', () => {
    const input = {
      filterBranchType: 'AND',
      filterBranches: [],
      filters: [],
      // Unknown BETA field
      betaFeatureFlag: true,
      someNestedBetaObject: { foo: 'bar' },
    };

    const result = PublicOrFilterBranchSchema.parse(input);

    // passthrough() ensures unknown fields are retained
    expect((result as Record<string, unknown>)['betaFeatureFlag']).toBe(true);
    expect((result as Record<string, unknown>)['someNestedBetaObject']).toEqual({ foo: 'bar' });
  });

  it('defaults filterBranches and filters to empty arrays when omitted', () => {
    const input = {
      filterBranchType: 'OR',
      // No filterBranches, no filters
    };

    const result = PublicOrFilterBranchSchema.parse(input);

    expect(result.filterBranches).toEqual([]);
    expect(result.filters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FlowSchema
// ---------------------------------------------------------------------------

describe('FlowSchema', () => {
  it('parses a complete flow object with all core fields', () => {
    const input = {
      id: 'flow_abc123',
      type: 'CONTACT_FLOW',
      flowType: 'WORKFLOW',
      isEnabled: true,
      objectTypeId: '0-1',
      name: 'Welcome Email Workflow',
      startActionId: 'action_1',
    };

    const result = FlowSchema.parse(input);

    expect(result.id).toBe('flow_abc123');
    expect(result.type).toBe('CONTACT_FLOW');
    expect(result.flowType).toBe('WORKFLOW');
    expect(result.isEnabled).toBe(true);
    expect(result.objectTypeId).toBe('0-1');
    expect(result.name).toBe('Welcome Email Workflow');
    expect(result.startActionId).toBe('action_1');
  });

  it('preserves unknown BETA fields via passthrough on FlowSchema', () => {
    const input = {
      id: 'flow_beta_456',
      type: 'DEAL_FLOW',
      isEnabled: false,
      name: 'Deal Nurture Flow',
      // Hypothetical BETA-only fields not in the documented schema
      betaFeature: 'enabled',
      internalRevision: 7,
      experimentalFlags: { feature_x: true },
    };

    const result = FlowSchema.parse(input);

    expect(result.id).toBe('flow_beta_456');
    // BETA fields pass through
    expect((result as Record<string, unknown>)['betaFeature']).toBe('enabled');
    expect((result as Record<string, unknown>)['internalRevision']).toBe(7);
    expect((result as Record<string, unknown>)['experimentalFlags']).toEqual({ feature_x: true });
  });

  it('parses enrollmentCriteria with nested filter branches', () => {
    const input = {
      id: 'flow_789',
      type: 'CONTACT_FLOW',
      isEnabled: false,
      name: 'Segmented Workflow',
      enrollmentCriteria: {
        listFilterBranch: {
          filterBranchType: 'OR',
          filterBranches: [
            {
              filterBranchType: 'AND',
              filterBranches: [],
              filters: [
                {
                  filterType: 'PROPERTY',
                  operation: { operator: 'EQ', value: 'lead' },
                  property: 'lifecyclestage',
                },
              ],
            },
          ],
          filters: [],
        },
        reEnrollmentTriggersFilterBranches: [],
      },
    };

    const result = FlowSchema.parse(input);

    expect(result.enrollmentCriteria).toBeDefined();
    const criteria = result.enrollmentCriteria!;
    expect(criteria.listFilterBranch).toBeDefined();
    const branch = criteria.listFilterBranch!;
    expect(branch.filterBranchType).toBe('OR');
    expect(branch.filterBranches).toHaveLength(1);

    const childBranch = branch.filterBranches[0];
    expect(childBranch.filterBranchType).toBe('AND');
    expect(childBranch.filters[0].property).toBe('lifecyclestage');
  });

  it('accepts a flow with only required fields (id, type, isEnabled, name)', () => {
    const minimal = {
      id: 'flow_min',
      type: 'TICKET_FLOW',
      isEnabled: false,
      name: 'Minimal Flow',
    };

    const result = FlowSchema.parse(minimal);

    expect(result.id).toBe('flow_min');
    expect(result.name).toBe('Minimal Flow');
    // Optional fields are undefined
    expect(result.flowType).toBeUndefined();
    expect(result.actions).toBeUndefined();
    expect(result.enrollmentCriteria).toBeUndefined();
  });
});
