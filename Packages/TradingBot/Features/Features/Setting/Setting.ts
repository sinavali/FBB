import { ISetting, IUpdateSetting } from "@shared/Types/Interfaces/general.ts";
import { SettingParsTo } from "@shared/Types/Enums.ts";
import { Setting as DBSetting } from "@prisma/client";
import { GeneralStore } from "@shared/Types/Interfaces/generalStore.ts";

export default class Setting {
  private settings: ISetting[] = [];

  private generalStore: GeneralStore;

  // capacity = 22000 means 2 weeks and 4 days of 1-minute candles
  constructor(generalStoreInstance: GeneralStore) {
    this.generalStore = generalStoreInstance;
    this.fetch();
  }

  /**
   * Get all settings.
   * @returns Array of all settings.
   */
  getAll(): ISetting[] {
    return this.settings;
  }

  /**
   * Get a single setting by its ID.
   * @param key - The settingKey value of the setting to retrieve.
   * @returns The setting object if found, otherwise undefined.
   */
  getOne(key: string): ISetting | undefined {
    const setting = this.settings.find((setting) => setting.settingKey === key);
    if (setting) return this.parseSettingsTypes(setting);
    else return undefined;
  }

  parseSettingsTypes(setting: DBSetting): ISetting {
    if (setting.parseTo === SettingParsTo.INT)
      return {
        ...setting,
        settingValueParsed: Number(setting.settingValue),
      };
    else if (setting.parseTo === SettingParsTo.FLOAT)
      return {
        ...setting,
        settingValueParsed: Number(setting.settingValue),
      };
    else if (setting.parseTo === SettingParsTo.BIGINT)
      return {
        ...setting,
        settingValueParsed: BigInt(setting.settingValue),
      };
    else if (setting.parseTo === SettingParsTo.STRING)
      return {
        ...setting,
        settingValueParsed: `${setting.settingValue}`,
      };
    else if (setting.parseTo === SettingParsTo.BOOLEAN)
      return {
        ...setting,
        settingValueParsed: !!Number(setting.settingValue),
      };
    else return { ...setting, settingValueParsed: undefined };
  }

  /**
   * Get multiple settings by their IDs.
   * @param ids - An array of IDs of the settings to retrieve.
   * @returns Array of matching settings.
   */
  getThese(keys: string[]): ISetting[] {
    return this.settings.filter((setting) => keys.includes(setting.settingKey));
  }

  /**
   * Update a specific setting by ID with the provided parameters.
   * @param params - An object containing the updated properties.
   * @returns The updated setting object if successful, otherwise undefined.
   */
  changeThis(params: IUpdateSetting): ISetting | undefined {
    try {
      const index = this.settings.findIndex(
        (setting) => setting.settingKey === params.settingKey
      );

      if (index !== -1) {
        this.settings[index] = {
          ...this.settings[index],
          settingKey: params.settingKey,
          settingValue: params.settingValue,
          parseTo: params.parseTo,
        };

        this.generalStore.state.Prisma.setting.update({
          where: { id: params.id },
          data: params,
        });

        return this.settings[index];
      } else throw "setting not found";
    } catch (err) {
      return undefined;
    }
  }

  /**
   * Fetch initial settings from and save in database.
   * @returns new fetched settings
   */
  async fetch() {
    try {
      const prisma = this.generalStore.state.Prisma;
      if (!prisma) throw "Prisma instance not found";

      const settingsFromDatabase: DBSetting[] = await prisma.setting.findMany();
      this.settings = settingsFromDatabase.map((s) =>
        this.parseSettingsTypes(s)
      );

      return this.settings;
    } catch (error) {
      console.error("Error fetching initial settings:", error);
      throw error;
    }
  }
}
