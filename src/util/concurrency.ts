/**
 * Concurrency utilities for controlled parallel execution
 * 
 * This module provides tools for executing tasks with controlled concurrency,
 * enabling parallel processing while preventing resource overload.
 */

/**
 * Result of a task execution with success/error tracking
 */
export interface TaskResult<T> {
  index: number
  success: boolean
  data?: T
  error?: Error
}

/**
 * Options for configuring the concurrency pool
 */
export interface ConcurrencyPoolOptions {
  maxConcurrent?: number
  onProgress?: (completed: number, total: number) => void
}

/**
 * Executes an array of items through a mapper function with controlled concurrency
 * 
 * This function processes items in parallel while respecting concurrency limits,
 * ensuring that no more than `maxConcurrent` tasks run simultaneously. It preserves
 * the original ordering of results and provides progress callbacks.
 * 
 * @param items - Array of items to process
 * @param mapper - Async function that processes each item and returns a result
 * @param options - Configuration options for concurrency control
 * @returns Promise resolving to array of TaskResults in original order
 * 
 * @example
 * ```typescript
 * const results = await mapWithConcurrency(
 *   [1, 2, 3, 4, 5],
 *   async (item, index) => {
 *     // Simulate async work
 *     await delay(100)
 *     return item * 2
 *   },
 *   { maxConcurrent: 2 }
 * )
 * 
 * // Results are in original order
 * results[0] // { index: 0, success: true, data: 2 }
 * results[1] // { index: 1, success: true, data: 4 }
 * ```
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options?: ConcurrencyPoolOptions
): Promise<TaskResult<R>[]> {
  const maxConcurrent = Math.max(1, options?.maxConcurrent ?? 8)
  const results: TaskResult<R>[] = new Array(items.length)
  let completedCount = 0

  // Handle empty array case
  if (items.length === 0) {
    return results
  }

  return new Promise((resolve, reject) => {
    let currentIndex = 0
    let activeCount = 0
    let hasError = false

    const updateProgress = () => {
      completedCount = results.filter(r => r !== undefined).length
      options?.onProgress?.(completedCount, items.length)
    }

    const checkComplete = () => {
      if (currentIndex >= items.length && activeCount === 0 && !hasError) {
        resolve(results)
      }
    }

    const runTask = async (index: number) => {
      if (hasError) return

      activeCount++
      const item = items[index]

      try {
        const data = await mapper(item, index)
        results[index] = { index, success: true, data }
      } catch (error) {
        results[index] = { 
          index, 
          success: false, 
          error: error as Error 
        }
      } finally {
        activeCount--
        updateProgress()
        checkComplete()

        // Start next task if available
        if (currentIndex < items.length && activeCount < maxConcurrent && !hasError) {
          runTask(currentIndex++)
        }
      }
    }

    // Start initial batch of tasks
    const initialBatch = Math.min(maxConcurrent, items.length)
    for (let i = 0; i < initialBatch; i++) {
      const index = currentIndex++
      runTask(index)
    }
  })
}

/**
 * Delays execution for the specified number of milliseconds
 * Used for testing and simulation purposes
 * 
 * @param ms - Number of milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}