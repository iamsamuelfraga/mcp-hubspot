/**
 * Unit tests for default search property sets.
 */
import { describe, it, expect } from 'vitest';
import { defaultSearchProperties } from '../utils/default-properties.js';

describe('defaultSearchProperties', () => {
  it('returns curated business-readable properties for deals', () => {
    const props = defaultSearchProperties('deals');
    expect(props).toContain('dealname');
    expect(props).toContain('amount');
    expect(props).toContain('dealstage');
    expect(props).toContain('hubspot_owner_id');
  });

  it('returns curated properties for contacts', () => {
    const props = defaultSearchProperties('contacts');
    expect(props).toContain('email');
    expect(props).toContain('firstname');
    expect(props).toContain('lastname');
  });

  it('is case-insensitive on the object type name', () => {
    expect(defaultSearchProperties('Deals')).toEqual(defaultSearchProperties('deals'));
  });

  it('falls back to generic properties for unknown/custom object types', () => {
    const props = defaultSearchProperties('2-12345678');
    expect(props).toContain('createdate');
    expect(props).toContain('hubspot_owner_id');
    expect(props.length).toBeGreaterThan(0);
  });

  it('never returns an empty list', () => {
    expect(defaultSearchProperties('anything').length).toBeGreaterThan(0);
  });
});
