import { IWorkTime } from "@shared/Types/Interfaces/general.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import logger from "@shared/Initiatives/Logger.ts";
import moment from "moment-timezone";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import { WorkTime as DBWorkTime } from "@prisma/client";

export default class WorkTime {
  public workTimes: CircularBuffer<IWorkTime>;
  public workTimeRecords: DBWorkTime[] = [];
  private generalStore: GeneralStore;
  private indexMap: Map<number, number> = new Map();
  private maxId: number = 0;

  // capacity = 1500 means more than 1 year
  constructor(generalStoreInstance: GeneralStore, capacity: number = 100) {
    this.generalStore = generalStoreInstance;
    this.workTimes = new CircularBuffer<IWorkTime>(capacity);
  }

  /**
   * Fetch initial workTime records from and save in local.
   * @returns new fetched workTimes
   */
  async fetch(): Promise<DBWorkTime[]> {
    try {
      const generalStore = this.generalStore;
      const prisma = generalStore.state.Prisma;
      if (!prisma) throw "Prisma instance not found";

      this.workTimeRecords = await prisma.workTime.findMany();

      return this.workTimeRecords;
    } catch (error) {
      console.error("Error fetching initial workTime records:", error);
      throw error;
    }
  }

  isUnixInWorkTimeRecords(unix: number): DBWorkTime | undefined {
    const dateTime = moment.unix(unix).utc(); // Interpret `unix` timestamp in UTC
    return this.workTimeRecords.find((workTime) => {
      // Parse work time start and end times relative to `unix`'s day
      const workTimeStart = moment
        .utc(unix * 1000)
        .set("hour", parseInt(workTime.start.split(":")[0]))
        .set("minute", parseInt(workTime.start.split(":")[1]))
        .set("second", 0);

      const workTimeEnd = moment
        .utc(unix * 1000)
        .set("hour", parseInt(workTime.end.split(":")[0]))
        .set("minute", parseInt(workTime.end.split(":")[1]))
        .set("second", 0);

      if (workTimeStart.isBefore(workTimeEnd)) {
        // Normal range: start < end
        return dateTime.isBetween(workTimeStart, workTimeEnd, null, "[]");
      } else {
        // Cross-midnight range: end is on the next day
        const midnight = moment.unix(unix).utc().startOf("day").add(1, "day");
        return (
          dateTime.isBetween(workTimeStart, midnight, null, "[)") ||
          dateTime.isBetween(
            midnight.subtract(1, "day"),
            workTimeEnd,
            null,
            "[)"
          )
        );
      }
    });
  }

  handleWorkTimeForFlow(unix: number): IWorkTime | undefined {
    const workTimeRecord = this.isUnixInWorkTimeRecords(unix);
    if (!workTimeRecord) return this.workTimes.getNewest();

    const start = moment.unix(unix * 1000);
    start.set("hour", +workTimeRecord.start.split(":")[0]);
    start.set("minute", +workTimeRecord.start.split(":")[1]);

    const end = moment.unix(unix * 1000);
    end.set("hour", +workTimeRecord.end.split(":")[0]);
    end.set("minute", +workTimeRecord.end.split(":")[1]);

    // if the workTime is already exists, do not create a new one
    const workTimeExists = this.generalStore.state.WorkTime?.isExists(
      start.unix(),
      end.unix()
    );
    if (workTimeExists) return workTimeExists;

    const data = {
      id: ++this.maxId,
      start: {
        unix: start.unix(),
        utc: start,
      },
      end: {
        unix: end.unix(),
        utc: end,
      },
      workTimeId: workTimeRecord.id,
    };
    this.workTimes.add(data);

    // Remove old entries from the indexMap
    if (this.workTimes.getSize() > this.workTimes.getCapacity()) {
      const overwrittenItem = this.workTimes.getOldest();
      if (overwrittenItem) this.indexMap.delete(overwrittenItem.id);
    }

    return this.workTimes.getNewest();
  }

  /**
   * Get workTime have the specified start and end Unix timestamp.
   * @param start - Start Unix timestamp.
   * @param end - End Unix timestamp.
   * @returns Exact WorkTimes if exists.
   */
  isExists(start: number, end: number): IWorkTime | undefined {
    return this.workTimes
      .getAll()
      .find((wt) => wt.start.unix === start && wt.end.unix === end);
  }

  getWorkTime(id: number): IWorkTime | null {
    const index = this.getIndexById(id);
    return index !== undefined ? this.workTimes.get(index) : null;
  }

  getMaxId(): number {
    return this.maxId;
  }

  getIndexById(id: number): number | undefined {
    return this.indexMap.get(id);
  }
}
