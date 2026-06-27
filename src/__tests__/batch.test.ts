/**
 * Tests for batch processing utilities: chunk() and processBatchesSequential().
 */
import { describe, it, expect, vi } from 'vitest';
import { chunk, processBatchesSequential } from '../utils/batch.js';

vi.useFakeTimers();

describe('chunk', () => {
  it('splits an array into chunks of the given size', () => {
    const result = chunk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
  });

  it('returns a single chunk when array length is less than size', () => {
    const result = chunk([1, 2, 3], 10);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it('returns empty array for an empty input array', () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it('handles chunk size equal to array length', () => {
    const result = chunk([1, 2, 3], 3);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it('handles chunk size of 1', () => {
    const result = chunk([1, 2, 3], 1);
    expect(result).toEqual([[1], [2], [3]]);
  });

  it('uses default batch size of 100', () => {
    const arr = Array.from({ length: 250 }, (_, i) => i);
    const result = chunk(arr);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(100);
    expect(result[1]).toHaveLength(100);
    expect(result[2]).toHaveLength(50);
  });
});

describe('processBatchesSequential', () => {
  it('calls the processor with each batch and concatenates results', async () => {
    const items = [1, 2, 3, 4, 5];
    const processor = vi
      .fn()
      .mockImplementation(async (batch: number[]) => batch.map((x) => x * 2));

    const promise = processBatchesSequential(items, processor, { batchSize: 2, delayMs: 0 });
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(processor).toHaveBeenCalledTimes(3); // [1,2], [3,4], [5]
    expect(processor).toHaveBeenNthCalledWith(1, [1, 2]);
    expect(processor).toHaveBeenNthCalledWith(2, [3, 4]);
    expect(processor).toHaveBeenNthCalledWith(3, [5]);
  });

  it('processes a single batch when items fit in one chunk', async () => {
    const items = [1, 2, 3];
    const processor = vi.fn().mockResolvedValue([10, 20, 30]);

    const promise = processBatchesSequential(items, processor, { batchSize: 100, delayMs: 0 });
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toEqual([10, 20, 30]);
    expect(processor).toHaveBeenCalledTimes(1);
  });

  it('handles empty input array without calling processor', async () => {
    const processor = vi.fn().mockResolvedValue([]);

    const promise = processBatchesSequential([], processor, { batchSize: 100, delayMs: 0 });
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });

  it('uses default batchSize of 100 and delayMs of 50', async () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    const processor = vi.fn().mockImplementation(async (batch: number[]) => batch);

    const promise = processBatchesSequential(items, processor);
    await vi.runAllTimersAsync();
    await promise;

    expect(processor).toHaveBeenCalledTimes(2);
    expect(processor.mock.calls[0][0]).toHaveLength(100);
    expect(processor.mock.calls[1][0]).toHaveLength(50);
  });
});
