import logger from "@shared/Initiatives/Logger.ts";
import { CircularBufferMethodCondition } from "@shared/Types/Interfaces/common.ts";

export class CircularBuffer<T extends { id: number }> {
  public buffer: T[];
  public capacity: number;
  public start: number = 0; // Pointer to the start of the buffer
  public size: number = 0; // Current number of items in the buffer

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity); // Pre-allocate the buffer
  }

  /**
   * Add a new item to the buffer.
   * The newest item will be at index 0.
   * @param item - The item to add.
   * @returns The added item.
   */
  add(item: T): T {
    // Calculate the index for the new item
    this.start = (this.start - 1 + this.capacity) % this.capacity; // Move start backward
    this.buffer[this.start] = item; // Add the item at the new start
    if (this.size < this.capacity) this.size++; // Increase size if buffer is not full
    return item;
  }

  /**
   * Get an item by index.
   * @param index - The index of the item (0 = newest).
   * @returns The item at the specified index, or null if the index is out of bounds.
   */
  get(index: number): T | null {
    if (index < 0 || index >= this.size) return null; // Index out of bounds
    return this.buffer[(this.start + index) % this.capacity]; // Calculate the actual index
  }

  getById(id: number): T | undefined {
    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[(this.start + i) % this.capacity];
      if (item && item.id === id) return item; // Exit after finding and updating the item
    }
    return undefined;
  }

  /**
   * Get the newest item in the buffer.
   * @returns The newest item, or null if the buffer is empty.
   */
  getNewest(conditions?: CircularBufferMethodCondition<T>[]): T | undefined {
    if (this.size === 0) return undefined; // Buffer is empty

    // Newest item is at start
    const item = this.buffer[this.start];

    if (conditions && conditions.length) {
      let error = false;
      for (let j = 0; j < conditions.length; j++)
        if (item[conditions[j][0]] !== conditions[j][1]) error = true;
      if (!error) return item;
    } else return item;
  }

  /**
   * Get the oldest item in the buffer.
   * @returns The oldest item, or null if the buffer is empty.
   */
  getOldest(conditions?: CircularBufferMethodCondition<T>[]): T | undefined {
    if (this.size === 0) return undefined; // Buffer is empty

    // Oldest item is at (start + size - 1) % capacity
    const item = this.buffer[(this.start + this.size - 1) % this.capacity];

    if (conditions && conditions.length) {
      let error = false;
      for (let j = 0; j < conditions.length; j++)
        if (item[conditions[j][0]] !== conditions[j][1]) error = true;
      if (!error) return item;
    } else return item;
  }

  /**
   * Get the capacity of buffer.
   * @returns The capacity of the buffer.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get the current number of items in the buffer.
   * @returns The number of items in the buffer.
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Get all items in the buffer (newest first).
   * @returns An array of all items in the buffer.
   */
  getAll(conditions?: CircularBufferMethodCondition<T>[]): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[(this.start + i) % this.capacity];

      if (conditions && conditions.length) {
        let error = false;
        for (let j = 0; j < conditions.length; j++) {
          if (!conditions[j][2] || conditions[j][1] === "===") {
            if (item[conditions[j][0]] !== conditions[j][1]) error = true;
          } else if (conditions[j][1] === "!==") {
            if (item[conditions[j][0]] === conditions[j][1]) error = true;
          } else {
            error = true;
            logger.error(
              `invalid operan in getAll method => ${JSON.stringify(
                conditions[j]
              )} valid operans are '===', '!==' or null at third index`
            );
          }
        }
        if (!error) result.push(item);
      } else result.push(item);
    }
    return result;
  }
  /**
   * Get items from a starting index, taking a specified number of items.
   * @param from - The starting index (distance from the newest item).
   * @param take - The number of items to retrieve. If null or 0, retrieve all items from `from` to the newest item.
   * @returns An array of items in the specified range.
   */
  getRange(from: number, take?: number): T[] {
    // Validate `from`
    if (from < 0 || from >= this.size) return []; // `from` is out of bounds

    // Calculate the number of items to take
    const numToTake = !take
      ? this.size - from
      : Math.min(take, this.size - from);

    // Extract the range
    const result: T[] = [];
    for (let i = 0; i < numToTake; i++)
      result.push(this.buffer[(this.start + from + i) % this.capacity]);

    return result; // Reverse to maintain newest-to-oldest order
  }

  /**
   * Update an item by index.
   * @param index - The index of the item to update.
   * @param key - The key to update (e.g., "isDeep").
   * @param value - The new value for the key.
   */
  updateByIndex(index: number, key: keyof T, value: any): void {
    if (index < 0 || index >= this.size) return; // Index out of bounds
    const actualIndex = (this.start + index) % this.capacity;
    if (this.buffer[actualIndex]) this.buffer[actualIndex][key] = value; // Update the key
  }

  /**
   * Update an item by its id.
   * @param id - The id of the item to update.
   * @param key - The key to update (e.g., "isDeep").
   * @param value - The new value for the key.
   */
  updateById(id: number, key: keyof T, value: any): void {
    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[(this.start + i) % this.capacity];
      if (item && item.id === id) {
        item[key] = value; // Update the key
        return; // Exit after finding and updating the item
      }
    }
  }
}
