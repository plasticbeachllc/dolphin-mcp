import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import { mapWithConcurrency, type TaskResult, type ConcurrencyPoolOptions, delay } from '../util/concurrency.js'
import { initLogger } from '../util/logger.js'

// Clean up logs before tests
beforeAll(async () => {
  await initLogger()
})

afterAll(async () => {
  // Clean up after tests
})

describe('concurrency utilities', () => {
  describe('mapWithConcurrency', () => {
    it('executes tasks with controlled concurrency', async () => {
      const startTime = Date.now()
      const executionOrder: number[] = []
      
      const results = await mapWithConcurrency(
        [1, 2, 3, 4, 5, 6, 7, 8],
        async (item, index) => {
          executionOrder.push(item)
          await delay(50) // 50ms delay per task
          return item * 2
        },
        { maxConcurrent: 3 }
      )
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // With concurrency=3 and 8 items with 50ms delay each:
      // Total time should be around 150ms (3 batches * 50ms)
      expect(duration).toBeLessThan(250) // Allow some overhead
      expect(duration).toBeGreaterThan(120) // Should take at least some time
      
      // All tasks should complete successfully
      expect(results.length).toBe(8)
      results.forEach((result, index) => {
        expect(result.success).toBe(true)
        expect(result.index).toBe(index)
        expect(result.data).toBe((index + 1) * 2)
        expect(result.error).toBeUndefined()
      })
    })

    it('preserves result ordering regardless of execution order', async () => {
      const startTime = Date.now()
      const executionOrder: number[] = []
      
      // Create tasks with varying delays to test ordering
      const delays = [100, 10, 50, 5, 75, 25, 150, 1]
      
      const results = await mapWithConcurrency(
        delays.map((_, i) => i),
        async (item, index) => {
          executionOrder.push(item)
          await delay(delays[item])
          return `item-${item}`
        },
        { maxConcurrent: 4 }
      )
      
      const endTime = Date.now()
      
      // Verify results are in original order
      expect(results.length).toBe(8)
      results.forEach((result, index) => {
        expect(result.success).toBe(true)
        expect(result.index).toBe(index)
        expect(result.data).toBe(`item-${index}`)
      })
      
      // Execution order verification (may vary due to timing)
      expect(executionOrder.length).toBe(8)
      // All items should be processed
      expect(executionOrder).toContain(0)
      expect(executionOrder).toContain(7)
      // Results should be complete regardless of execution order
      expect(results.length).toBe(8)
    })

    it('handles errors gracefully and continues processing', async () => {
      const shouldError = (item: number) => item === 3 || item === 6
      
      const results = await mapWithConcurrency(
        [1, 2, 3, 4, 5, 6, 7],
        async (item, index) => {
          if (shouldError(item)) {
            throw new Error(`Error for item ${item}`)
          }
          await delay(10)
          return `success-${item}`
        },
        { maxConcurrent: 3 }
      )
      
      expect(results.length).toBe(7)
      
      // Check successful results
      const successResults = results.filter(r => r.success)
      expect(successResults.length).toBe(5)
      
      successResults.forEach(result => {
        expect(shouldError(result.index)).toBe(false)
        expect(result.data).toBe(`success-${result.index}`)
        expect(result.error).toBeUndefined()
      })
      
      // Check failed results
      const errorResults = results.filter(r => !r.success)
      expect(errorResults.length).toBe(2)
      
      errorResults.forEach(result => {
        expect(shouldError(result.index)).toBe(true)
        expect(result.data).toBeUndefined()
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error?.message).toContain(`Error for item ${result.index}`)
      })
    })

    it('invokes progress callbacks correctly', async () => {
      const progressCalls: Array<[number, number]> = []
      
      await mapWithConcurrency(
        [1, 2, 3, 4, 5],
        async (item) => {
          await delay(10)
          return item
        },
        {
          maxConcurrent: 2,
          onProgress: (completed, total) => {
            progressCalls.push([completed, total])
          }
        }
      )
      
      // Progress should be called for each completed task
      expect(progressCalls.length).toBe(5) // Once per completed task
      expect(progressCalls[0]).toEqual([1, 5])
      expect(progressCalls[1]).toEqual([2, 5])
      expect(progressCalls[2]).toEqual([3, 5])
      expect(progressCalls[3]).toEqual([4, 5])
      expect(progressCalls[4]).toEqual([5, 5])
    })

    it('handles empty arrays correctly', async () => {
      const results = await mapWithConcurrency(
        [],
        async (item) => {
          return item
        },
        { maxConcurrent: 3 }
      )
      
      expect(results).toEqual([])
    })

    it('handles single item arrays', async () => {
      const results = await mapWithConcurrency(
        [42],
        async (item, index) => {
          expect(index).toBe(0)
          return item * 2
        },
        { maxConcurrent: 3 }
      )
      
      expect(results.length).toBe(1)
      expect(results[0]).toEqual({
        index: 0,
        success: true,
        data: 84,
        error: undefined
      })
    })

    it('respects maxConcurrent limit', async () => {
      const activeTasks: Set<number> = new Set()
      const maxConcurrent = 2
      const concurrencyViolations: number[] = []
      
      await mapWithConcurrency(
        Array.from({ length: 8 }, (_, i) => i),
        async (item, index) => {
          activeTasks.add(item)
          
          if (activeTasks.size > maxConcurrent) {
            concurrencyViolations.push(activeTasks.size)
          }
          
          await delay(50)
          activeTasks.delete(item)
          return item
        },
        { maxConcurrent }
      )
      
      // No concurrency violations should occur
      expect(concurrencyViolations.length).toBe(0)
    })

    it('uses default maxConcurrent when not specified', async () => {
      const startTime = Date.now()
      
      const results = await mapWithConcurrency(
        Array.from({ length: 16 }, (_, i) => i),
        async (item) => {
          await delay(50)
          return item
        }
        // No maxConcurrent specified, should use default of 8
      )
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // With default concurrency=8 and 16 items with 50ms delay:
      // Should complete in around 100ms (2 batches * 50ms)
      expect(duration).toBeLessThan(200)
      expect(results.length).toBe(16)
      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.data).toBe(result.index)
      })
    })

    it('handles very large maxConcurrent values gracefully', async () => {
      const startTime = Date.now()
      
      const results = await mapWithConcurrency(
        [1, 2, 3],
        async (item, index) => {
          await delay(10)
          return item * 3
        },
        { maxConcurrent: 100 } // Much larger than item count
      )
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete quickly since maxConcurrent > item count
      expect(duration).toBeLessThan(100)
      expect(results.length).toBe(3)
      
      results.forEach(result => {
        expect(result.success).toBe(true)
        // result.data should be input item * 3, result.index should match input position
        expect(result.data).toBe((result.index + 1) * 3)
        expect(result.index).toBeLessThan(3)
        expect(result.index).toBeGreaterThanOrEqual(0)
      })
    })

    it('handles async operations with different timing patterns', async () => {
      const results = await mapWithConcurrency(
        [1, 2, 3, 4, 5],
        async (item) => {
          // Simulate varying async operations
          if (item % 2 === 0) {
            await delay(20) // Even items take longer
          } else {
            await delay(5) // Odd items are faster
          }
          return `processed-${item}`
        },
        { maxConcurrent: 3 }
      )
      
      expect(results.length).toBe(5)
      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.data).toBe(`processed-${result.index}`)
      })
    })

    it('propagates mapper function errors correctly', async () => {
      const errorMapper = async (item: number) => {
        if (item === 2) {
          throw new Error('Synchronous mapper error')
        }
        await delay(5)
        return item
      }
      
      const results = await mapWithConcurrency(
        [1, 2, 3],
        errorMapper,
        { maxConcurrent: 2 }
      )
      
      expect(results.length).toBe(3)
      
      // First item should succeed
      expect(results[0].success).toBe(true)
      expect(results[0].data).toBe(1)
      
      // Second item should fail
      expect(results[1].success).toBe(false)
      expect(results[1].error).toBeInstanceOf(Error)
      expect(results[1].error?.message).toBe('Synchronous mapper error')
      
      // Third item should still succeed
      expect(results[2].success).toBe(true)
      expect(results[2].data).toBe(3)
    })

    it('maintains stable index mapping for large datasets', async () => {
      const largeDataset = Array.from({ length: 100 }, (_, i) => i)
      
      const results = await mapWithConcurrency(
        largeDataset,
        async (item, index) => {
          // Process items out of order to test index stability
          await delay(Math.random() * 10)
          return item * 10
        },
        { maxConcurrent: 10 }
      )
      
      expect(results.length).toBe(100)
      
      // Verify each result maps to correct original index
      results.forEach((result, index) => {
        expect(result.index).toBe(index)
        expect(result.success).toBe(true)
        expect(result.data).toBe(index * 10)
      })
    })

    it('handles zero maxConcurrent gracefully', async () => {
      // This should not happen in practice, but test defensive coding
      const results = await mapWithConcurrency(
        [1, 2, 3],
        async (item) => {
          await delay(5)
          return item
        },
        { maxConcurrent: 0 }
      )
      
      // Should default to reasonable behavior
      expect(results.length).toBe(3)
      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.data).toBe(result.index + 1)
      })
    })

    it('handles negative maxConcurrent gracefully', async () => {
      // This should not happen in practice, but test defensive coding
      const results = await mapWithConcurrency(
        [1, 2, 3],
        async (item) => {
          await delay(5)
          return item
        },
        { maxConcurrent: -1 }
      )
      
      // Should default to reasonable behavior
      expect(results.length).toBe(3)
      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.data).toBe(result.index + 1)
      })
    })
  })

  describe('delay utility', () => {
    it('delays execution for specified duration', async () => {
      const startTime = Date.now()
      await delay(100)
      const endTime = Date.now()
      const duration = endTime - startTime
      
      expect(duration).toBeGreaterThanOrEqual(90) // Allow some timing variance
      expect(duration).toBeLessThan(150)
    })

    it('resolves with undefined', async () => {
      const result = await delay(10)
      expect(result).toBeUndefined()
    })
  })

  describe('TypeScript type safety', () => {
    it('correctly types TaskResult interface', async () => {
      const results = await mapWithConcurrency(
        [1, 2, 3],
        async (item) => {
          return item.toString()
        }
      )
      
      // Type check: results should be TaskResult<string>[]
      const typedResults: Array<TaskResult<string>> = results
      expect(typedResults.length).toBe(3)
    })

    it('correctly types ConcurrencyPoolOptions interface', async () => {
      const options: ConcurrencyPoolOptions = {
        maxConcurrent: 5,
        onProgress: (completed, total) => {
          expect(typeof completed).toBe('number')
          expect(typeof total).toBe('number')
        }
      }
      
      await mapWithConcurrency(
        [1, 2, 3],
        async (item) => item,
        options
      )
    })
  })
})