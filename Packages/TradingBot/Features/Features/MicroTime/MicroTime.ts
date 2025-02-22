import {
  IMicroTime,
  ISession,
  IWorkTime,
} from "@shared/Types/Interfaces/general.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import logger from "@shared/Initiatives/Logger.ts";
import { CircularBuffer } from "@tradingBot/Features/Core/CircularBuffer.ts";
import { MicroTimeType } from "@shared/Types/Enums.ts";
import { DateTime } from "@shared/Types/Interfaces/common.ts";

export default class MicroTime {
  public microTimes: CircularBuffer<IMicroTime>;
  private generalStore: GeneralStore;
  private indexMap: Map<number, number> = new Map();
  private maxId: number = 0;

  // capacity = 1500 means more than 1 year (1500 sessions and 1500 workTimes)
  constructor(generalStoreInstance: GeneralStore, capacity: number = 200) {
    this.generalStore = generalStoreInstance;
    this.microTimes = new CircularBuffer(capacity);
  }

  isExists(
    start: number,
    end: number,
    type: MicroTimeType
  ): IMicroTime | undefined {
    return this.microTimes
      .getAll()
      .find(
        (m) => m.start.unix === start && m.end.unix === end && m.type === type
      );
  }

  newMicroTime(
    start: DateTime,
    end: DateTime,
    type: MicroTimeType,
    session: ISession | null,
    workTime: IWorkTime | null
  ) {
    if (this.isExists(start.unix, end.unix, type)) return null;

    const data = {
      id: ++this.maxId,
      start,
      end,
      type,
      session,
      workTime,
    };

    this.microTimes.add(data);

    // Remove old entries from the indexMap
    if (this.microTimes.getSize() > this.microTimes.getCapacity()) {
      const overwrittenItem = this.microTimes.getOldest();
      if (overwrittenItem) this.indexMap.delete(overwrittenItem.id);
    }

    this.indexMap.set(data.id, this.microTimes.getSize() - 1);

    return this.microTimes.getNewest();
  }

  newMicroTimeForSession(session: ISession) {
    return this.newMicroTime(
      session.start,
      session.end,
      MicroTimeType.SESSION,
      session,
      null
    );
  }

  newMicroTimeForWorkTime(workTime: IWorkTime) {
    return this.newMicroTime(
      workTime.start,
      workTime.end,
      MicroTimeType.WORKTIME,
      null,
      workTime
    );
  }

  getMicroTimeById(id: number): IMicroTime | null {
    const index = this.getIndexById(id);
    return index !== undefined ? this.microTimes.get(index) : null;
  }

  getMicroTimeByType(type: MicroTimeType): IMicroTime[] {
    const microTimes = this.microTimes
      .getAll()
      .filter((mt) => mt.type === type);
    return microTimes;
  }

  getMaxId(): number {
    return this.maxId;
  }

  getIndexById(id: number): number | undefined {
    return this.indexMap.get(id);
  }
}
