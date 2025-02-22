import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";

describe("CircularBuffer", () => {
  interface TestItem {
    id: number;
    value: string;
  }

  let buffer: CircularBuffer<TestItem>;

  beforeEach(() => {
    buffer = new CircularBuffer<TestItem>(3); // Capacity of 3
  });

  test("adds items and overwrites when full", () => {
    buffer.add({ id: 1, value: "A" });
    buffer.add({ id: 2, value: "B" });
    buffer.add({ id: 3, value: "C" });

    expect(buffer.getAll()).toEqual([
      { id: 3, value: "C" },
      { id: 2, value: "B" },
      { id: 1, value: "A" },
    ]);

    buffer.add({ id: 4, value: "D" }); // Overwrites the oldest item

    expect(buffer.getAll()).toEqual([
      { id: 4, value: "D" },
      { id: 3, value: "C" },
      { id: 2, value: "B" },
    ]);
  });

  test("retrieves items by index", () => {
    buffer.add({ id: 1, value: "A" });
    buffer.add({ id: 2, value: "B" });
    buffer.add({ id: 3, value: "C" });

    expect(buffer.get(0)).toEqual({ id: 3, value: "C" }); // Newest
    expect(buffer.get(2)).toEqual({ id: 1, value: "A" }); // Oldest
    expect(buffer.get(3)).toBeNull(); // Out of bounds
  });

  test("gets newest and oldest items", () => {
    expect(buffer.getNewest()).toBeUndefined(); // Empty buffer
    expect(buffer.getOldest()).toBeUndefined();

    buffer.add({ id: 1, value: "A" });
    buffer.add({ id: 2, value: "B" });
    buffer.add({ id: 3, value: "B" });

    expect(buffer.getNewest()).toEqual({ id: 3, value: "B" });
    expect(buffer.getOldest()).toEqual({ id: 1, value: "A" });

    // check with conditions
    expect(buffer.getAll([["value", "B"]]).length).toBe(2);
  });

  test("retrieves all items in newest-to-oldest order", () => {
    buffer.add({ id: 1, value: "A" });
    buffer.add({ id: 2, value: "B" });
    buffer.add({ id: 3, value: "C" });

    expect(buffer.getAll()).toEqual([
      { id: 3, value: "C" },
      { id: 2, value: "B" },
      { id: 1, value: "A" },
    ]);

    buffer.add({ id: 4, value: "D" });

    expect(buffer.getAll()).toEqual([
      { id: 4, value: "D" },
      { id: 3, value: "C" },
      { id: 2, value: "B" },
    ]);
  });

  test("retrieves a range of items", () => {
    const testData = [
      { id: 1, value: "A" },
      { id: 2, value: "B" },
      { id: 3, value: "C" },
    ];
    const testDataResult = [
      { id: 3, value: "C" },
      { id: 2, value: "B" },
      { id: 1, value: "A" },
    ];
    buffer.add(testData[0]); // Newest
    buffer.add(testData[1]);
    buffer.add(testData[2]); // Oldest

    // Take 1 item from index 2 (distance from newest)
    expect(buffer.getRange(2, 1)).toStrictEqual([testDataResult[2]]);

    // Take all items from index 2
    expect(buffer.getRange(2)).toStrictEqual([testDataResult[2]]);

    // Take all items when "take" is 0
    expect(buffer.getRange(0, 0)).toStrictEqual(testDataResult);

    // Out of bounds: from index 3
    expect(buffer.getRange(3, 0)).toStrictEqual([]);
  });

  test("updates an item by index", () => {
    buffer.add({ id: 1, value: "A" }); // Newest
    buffer.add({ id: 2, value: "B" });

    // Valid index update
    buffer.updateByIndex(0, "value", "Z");
    expect(buffer.getNewest()).toEqual({ id: 2, value: "Z" });

    // Invalid index update (out of bounds)
    buffer.updateByIndex(2, "value", "X");
    expect(buffer.get(2)).toBeNull(); // Ensure no changes occurred
  });

  test("updates an item by id", () => {
    buffer.add({ id: 1, value: "A" });
    buffer.add({ id: 2, value: "B" });
    buffer.add({ id: 3, value: "B" });

    // Valid ID update
    buffer.updateById(1, "value", "Z");
    expect(buffer.getAll()).toContainEqual({ id: 1, value: "Z" });

    // Invalid ID update (nonexistent ID)
    buffer.updateById(4, "value", "X");
    expect(buffer.getAll()).not.toContainEqual({ id: 4, value: "X" });

    // check with conditions
    expect(buffer.getAll([["value", "B"]]).length).toBe(2);
  });
});
