/**
 * Tests for CRM object type validation and configuration registry.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidObjectType,
  validateObjectType,
  OBJECT_TYPE_CONFIG,
  CRM_OBJECT_TYPES,
} from '../utils/object-types.js';

describe('isValidObjectType', () => {
  it('returns true for all valid CRM object types', () => {
    for (const type of CRM_OBJECT_TYPES) {
      expect(isValidObjectType(type)).toBe(true);
    }
  });

  it('returns true for deals', () => {
    expect(isValidObjectType('deals')).toBe(true);
  });

  it('returns false for contacts (not in the supported list)', () => {
    expect(isValidObjectType('contacts')).toBe(false);
  });

  it('returns false for companies (not in the supported list)', () => {
    expect(isValidObjectType('companies')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidObjectType('')).toBe(false);
  });

  it('returns false for arbitrary invalid strings', () => {
    expect(isValidObjectType('invoices')).toBe(false);
    expect(isValidObjectType('DEALS')).toBe(false); // case-sensitive
    expect(isValidObjectType('deal')).toBe(false); // singular vs plural
  });
});

describe('validateObjectType', () => {
  it('returns the type unchanged for valid inputs', () => {
    expect(validateObjectType('deals')).toBe('deals');
    expect(validateObjectType('calls')).toBe('calls');
    expect(validateObjectType('line_items')).toBe('line_items');
  });

  it('throws an error with a descriptive message for invalid types', () => {
    expect(() => validateObjectType('contacts')).toThrow('Invalid CRM object type');
    expect(() => validateObjectType('contacts')).toThrow('contacts');
  });

  it('throws for an empty string', () => {
    expect(() => validateObjectType('')).toThrow('Invalid CRM object type');
  });
});

describe('OBJECT_TYPE_CONFIG', () => {
  it('has a config entry for every CRM_OBJECT_TYPES value', () => {
    for (const type of CRM_OBJECT_TYPES) {
      expect(OBJECT_TYPE_CONFIG).toHaveProperty(type);
    }
  });

  it('assigns deals to the sales toolset', () => {
    expect(OBJECT_TYPE_CONFIG.deals.toolset).toBe('sales');
  });

  it('assigns calls to the engagements toolset', () => {
    expect(OBJECT_TYPE_CONFIG.calls.toolset).toBe('engagements');
  });

  it('assigns meetings to the engagements toolset', () => {
    expect(OBJECT_TYPE_CONFIG.meetings.toolset).toBe('engagements');
  });

  it('assigns tasks to the engagements toolset', () => {
    expect(OBJECT_TYPE_CONFIG.tasks.toolset).toBe('engagements');
  });

  it('assigns notes to the engagements toolset', () => {
    expect(OBJECT_TYPE_CONFIG.notes.toolset).toBe('engagements');
  });

  it('assigns emails to the engagements toolset', () => {
    expect(OBJECT_TYPE_CONFIG.emails.toolset).toBe('engagements');
  });

  it('assigns products to the sales toolset', () => {
    expect(OBJECT_TYPE_CONFIG.products.toolset).toBe('sales');
  });

  it('has valid basePath for each type (starts with crm/v3)', () => {
    for (const [, config] of Object.entries(OBJECT_TYPE_CONFIG)) {
      expect(config.basePath).toMatch(/^crm\/v3\/objects\//);
    }
  });

  it('has read and write scopes for deals', () => {
    expect(OBJECT_TYPE_CONFIG.deals.scopeRead).toBe('crm.objects.deals.read');
    expect(OBJECT_TYPE_CONFIG.deals.scopeWrite).toBe('crm.objects.deals.write');
  });
});
