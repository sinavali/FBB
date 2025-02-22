import MicroTime from "@tradingBot/Features/Features/MicroTime/MicroTime.ts";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";
import { MicroTimeType } from "@shared/Types/Enums.ts";
import {
  IMicroTime,
  ISession,
  IWorkTime,
} from "@shared/Types/Interfaces/general.ts";

describe("MicroTime", () => {
  let generalStoreMock: GeneralStore;
  let microTime: MicroTime;

  beforeEach(() => {
    generalStoreMock = {
      state: {} as any, // Minimal mock for GeneralStore
      globalStates: {} as any,
      setter: {} as any,
    };
    microTime = new MicroTime(generalStoreMock, 10); // Initialize with small capacity for testing
  });

  it("should initialize with default values", () => {
    expect(microTime.microTimes.getAll()).toEqual([]);
    expect(microTime.getMaxId()).toBe(0);
  });

  it("should add a new session MicroTime", () => {
    const session: ISession = {
      id: 1,
      start: { unix: 1000, utc: null! },
      end: { unix: 2000, utc: null! },
      sessionId: 1,
    };

    const added = microTime.newMicroTimeForSession(session);

    expect(added).toEqual({
      id: 1,
      type: MicroTimeType.SESSION,
      start: session.start,
      end: session.end,
      session: session,
      workTime: null,
    });
    expect(microTime.getMaxId()).toBe(1);
  });

  it("should add a new work time MicroTime", () => {
    const workTime: IWorkTime = {
      id: 1,
      start: { unix: 3000, utc: null! },
      end: { unix: 4000, utc: null! },
      workTimeId: 1,
    };

    const added = microTime.newMicroTimeForWorkTime(workTime);

    expect(added).toEqual({
      id: 1,
      type: MicroTimeType.WORKTIME,
      start: workTime.start,
      end: workTime.end,
      session: null,
      workTime: workTime,
    });
    expect(microTime.getMaxId()).toBe(1);
  });

  it("should prevent adding overlapping MicroTime", () => {
    const workTime: IWorkTime = {
      id: 1,
      start: { unix: 3000000000, utc: null! },
      end: { unix: 4000000000, utc: null! },
      workTimeId: 1,
    };

    microTime.newMicroTimeForWorkTime(workTime);

    const overlappingWorkTime: IWorkTime = {
      id: 2,
      start: { unix: 3000000000, utc: null! },
      end: { unix: 4000000000, utc: null! },
      workTimeId: 2,
    };

    const added = microTime.newMicroTimeForWorkTime(overlappingWorkTime);
    expect(added).toBeNull();
    expect(microTime.getMaxId()).toBe(1);
  });

  it("should retrieve MicroTime by ID", () => {
    const workTime: IWorkTime = {
      id: 1,
      start: { unix: 3000, utc: null! },
      end: { unix: 4000, utc: null! },
      workTimeId: 1,
    };

    microTime.newMicroTimeForWorkTime(workTime);

    const result = microTime.getMicroTimeById(1);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
  });

  it("should return null if MicroTime ID is not found", () => {
    const result = microTime.getMicroTimeById(999);
    expect(result).toBeNull();
  });

  it("should retrieve MicroTimes by type", () => {
    const session: ISession = {
      id: 1,
      start: { unix: 1000, utc: null! },
      end: { unix: 2000, utc: null! },
      sessionId: 1,
    };

    const workTime: IWorkTime = {
      id: 2,
      start: { unix: 3000, utc: null! },
      end: { unix: 4000, utc: null! },
      workTimeId: 2,
    };

    microTime.newMicroTimeForSession(session);
    microTime.newMicroTimeForWorkTime(workTime);

    const sessions = microTime.getMicroTimeByType(MicroTimeType.SESSION);
    const workTimes = microTime.getMicroTimeByType(MicroTimeType.WORKTIME);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].type).toBe(MicroTimeType.SESSION);
    expect(workTimes).toHaveLength(1);
    expect(workTimes[0].type).toBe(MicroTimeType.WORKTIME);
  });

  it("should check if a unix timestamp exists in MicroTime records", () => {
    const session: ISession = {
      id: 1,
      start: { unix: 1000000000, utc: null! },
      end: { unix: 2000000000, utc: null! },
      sessionId: 1,
    };

    microTime.newMicroTimeForSession(session);

    const exists = microTime.isExists(
      session.start.unix,
      session.end.unix,
      MicroTimeType.SESSION
    );

    expect(exists).toStrictEqual({
      id: 1,
      type: MicroTimeType.SESSION,
      start: { unix: session.start.unix, utc: null! },
      end: { unix: session.end.unix, utc: null! },
      session,
      workTime: null,
    });
  });

  it("should handle a large capacity and maintain correct MicroTime order", () => {
    const capacity = 100;
    const largeMicroTime = new MicroTime(generalStoreMock, capacity);

    for (let i = 0; i < capacity; i++) {
      largeMicroTime.newMicroTime(
        { unix: i * 1000, utc: null! },
        { unix: (i + 1) * 1000, utc: null! },
        MicroTimeType.SESSION,
        {
          id: i + 1,
          start: { unix: i * 1000, utc: null! },
          end: { unix: (i + 1) * 1000, utc: null! },
          sessionId: i + 1,
        },
        null
      );
    }

    const newest = largeMicroTime.microTimes.getNewest();
    expect(newest?.id).toBe(capacity);
    expect(largeMicroTime.getMaxId()).toBe(capacity);
  });
});
