/**
 * Tests for the paginate() cursor-based pagination helper.
 */
import { describe, it, expect, vi } from 'vitest';
import { paginate } from '../utils/pagination.js';
import { type CollectionResponse } from '../types/hubspot-api.js';

describe('paginate', () => {
  it('returns all results when there is a single page (no paging.next)', async () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const fetcher = vi.fn().mockResolvedValue({
      results: items,
      // No paging field → single page
    } satisfies CollectionResponse<{ id: string }>);

    const result = await paginate(fetcher);

    expect(result).toEqual(items);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(undefined); // first call with no cursor
  });

  it('iterates two pages using paging.next.after cursor', async () => {
    const page1Items = [{ id: '1' }, { id: '2' }];
    const page2Items = [{ id: '3' }, { id: '4' }];

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        results: page1Items,
        paging: { next: { after: 'cursor-page-2' } },
      } satisfies CollectionResponse<{ id: string }>)
      .mockResolvedValueOnce({
        results: page2Items,
        // No paging → last page
      } satisfies CollectionResponse<{ id: string }>);

    const result = await paginate(fetcher);

    expect(result).toEqual([...page1Items, ...page2Items]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, undefined);
    expect(fetcher).toHaveBeenNthCalledWith(2, 'cursor-page-2');
  });

  it('stops early when maxItems is reached before exhausting pages', async () => {
    const page1Items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const page2Items = [{ id: '4' }, { id: '5' }];

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        results: page1Items,
        paging: { next: { after: 'cursor-2' } },
      } satisfies CollectionResponse<{ id: string }>)
      .mockResolvedValueOnce({
        results: page2Items,
      } satisfies CollectionResponse<{ id: string }>);

    // maxItems = 2 → should stop after collecting 2 items from page 1
    const result = await paginate(fetcher, 2);

    expect(result).toHaveLength(2);
    expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    // fetcher called once (first page) – maxItems satisfied within that page
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('handles maxItems that spans exactly one full page', async () => {
    const page1Items = [{ id: '1' }, { id: '2' }];
    const page2Items = [{ id: '3' }];

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        results: page1Items,
        paging: { next: { after: 'cursor-2' } },
      } satisfies CollectionResponse<{ id: string }>)
      .mockResolvedValueOnce({
        results: page2Items,
      } satisfies CollectionResponse<{ id: string }>);

    // maxItems = 2 → exact match from first page, stop before fetching page 2
    const result = await paginate(fetcher, 2);

    expect(result).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when the first page has no results', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      results: [],
    } satisfies CollectionResponse<{ id: string }>);

    const result = await paginate(fetcher);

    expect(result).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
