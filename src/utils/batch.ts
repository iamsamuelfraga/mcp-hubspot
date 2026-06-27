/**
 * Batch processing helpers for HubSpot bulk API operations.
 *
 * HubSpot's batch endpoints (e.g., `/crm/v3/objects/deals/batch/read`) accept
 * up to 100 objects per request. These utilities handle splitting large arrays
 * into appropriate chunks and processing them sequentially to stay within rate limits.
 */
import { logger } from './logger.js';

/**
 * Splits an array into sub-arrays (chunks) of a given maximum size.
 *
 * @template T - The type of array elements.
 * @param array - The source array to split.
 * @param size - Maximum number of elements per chunk. Default: 100 (HubSpot batch limit).
 * @returns An array of chunks. Returns an empty array if the input is empty.
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // → [[1, 2], [3, 4], [5]]
 * chunk([], 100)             // → []
 * chunk([1, 2, 3], 10)       // → [[1, 2, 3]]
 */
export function chunk<T>(array: T[], size = 100): T[][] {
  if (array.length === 0) return [];

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Options for sequential batch processing.
 */
export interface BatchProcessingOptions {
  /** Number of items per batch. Default: 100. */
  batchSize?: number;
  /** Delay in milliseconds between successive batch requests. Default: 50. */
  delayMs?: number;
}

/**
 * Processes a large array of items in sequential batches, with an optional
 * delay between each batch to avoid overwhelming the rate limiter.
 *
 * Each batch is passed to `processor` which must return the corresponding
 * output items. Results from all batches are concatenated and returned.
 *
 * @template TInput - The type of input items.
 * @template TOutput - The type of output items returned by the processor.
 * @param items - All input items to process.
 * @param processor - Async function that processes one batch and returns outputs.
 * @param options - Optional configuration for batch size and inter-batch delay.
 * @returns Combined output from all batches in order.
 *
 * @example
 * const results = await processBatchesSequential(
 *   dealIds,
 *   async (batch) => {
 *     const response = await client.post('/crm/v3/objects/deals/batch/read', {
 *       inputs: batch.map((id) => ({ id })),
 *       properties: ['dealname', 'amount'],
 *     });
 *     return response.results;
 *   },
 *   { batchSize: 100, delayMs: 100 }
 * );
 */
export async function processBatchesSequential<TInput, TOutput>(
  items: TInput[],
  processor: (batch: TInput[]) => Promise<TOutput[]>,
  options: BatchProcessingOptions = {}
): Promise<TOutput[]> {
  const { batchSize = 100, delayMs = 50 } = options;
  const batches = chunk(items, batchSize);
  const results: TOutput[] = [];

  logger.info('Processing items in batches', {
    totalItems: items.length,
    batchCount: batches.length,
    batchSize,
  });

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.debug('Processing batch', {
      batchIndex: i + 1,
      batchTotal: batches.length,
      size: batch.length,
    });

    const batchResults = await processor(batch);
    results.push(...batchResults);

    // Pause between batches (skip after the last one)
    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.info('Batch processing completed', { totalProcessed: results.length });
  return results;
}
