import { ITime } from "@shared/Types/Interfaces/general.ts";

export default class Time {
  public times: ITime[] = [];

  add(name: string, time: number): void {
    const modelIndex = this.times.findIndex((t) => t.name === name);

    if (modelIndex >= 0) {
      const model = this.times[modelIndex];
      if (time && time < model.minTime) this.times[modelIndex].minTime = time;
      if (time > model.maxTime) this.times[modelIndex].maxTime = time;
    } else {
      const model: ITime = {
        maxTime: time,
        minTime: time,
        name,
      };
      this.times.push(model);
    }
  }

  get(name: string): ITime | undefined {
    return this.times.find((t) => t.name === name);
  }

  getAll(): ITime[] {
    return this.times;
  }
}
