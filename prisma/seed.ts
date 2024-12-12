import { PrismaClient } from "@prisma/client";

let prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0`;
  await setSettings();
  await setTimeStuff();
  await setCurrencies();
}

async function setSettings() {
  await prisma.$executeRaw`TRUNCATE TABLE Setting`;
  await prisma.setting.createMany({
    data: [
      {
        settingKey: "SystemBackTestMode",
        settingValue: "1",
        parseTo: "Boolean",
      },
      { settingKey: "SignalReward", settingValue: "2", parseTo: "Int" },
      { settingKey: "SignalLoss", settingValue: "1", parseTo: "Int" },
      {
        settingKey: "SignalStopLossError",
        settingValue: "0.005",
        parseTo: "Float",
      },
      {
        settingKey: "SignalTakeProfitError",
        settingValue: "0.005",
        parseTo: "Float",
      },
      {
        settingKey: "SignalNoNewTriggerWhenThereIsOne",
        settingValue: "0",
        parseTo: "Boolean",
      },
      { settingKey: "COBPostStartCount", settingValue: "1", parseTo: "Int" },
      { settingKey: "COBBodyCount", settingValue: "3", parseTo: "Int" },
      { settingKey: "COBPastConfirmCount", settingValue: "3", parseTo: "Int" },
      {
        settingKey: "COBCandlesFromConfirmToDetermineLimitCount",
        settingValue: "6",
        parseTo: "Int",
      },
      {
        settingKey: "COBPastConfirmCandlesCount",
        settingValue: "10",
        parseTo: "Int",
      },
      {
        settingKey: "SystemBrokerTimezoneName",
        settingValue: "Europe/Moscow",
        parseTo: "String",
      },
      {
        settingKey: "MSSHeightLimitDivider",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "MSSMultipleFVGHeightLimitDivider",
        settingValue: "2",
        parseTo: "Int",
      },
      { settingKey: "MSSSmallHeightLimit", settingValue: "4", parseTo: "Int" },
      { settingKey: "MSSBigHeightLimit", settingValue: "11", parseTo: "Int" },
      { settingKey: "COBStopHeightLimit", settingValue: "10", parseTo: "Int" },
      {
        settingKey: "DPCorrelationByFirstWaveMaxDiffTime",
        settingValue: "2.5",
        parseTo: "Int",
      },
      { settingKey: "DPMinWavesCount", settingValue: "3", parseTo: "Int" },
      { settingKey: "DPMaxWavesCount", settingValue: "5", parseTo: "Int" },
      {
        settingKey: "DPMatchDiffCandleCount",
        settingValue: "10",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityMaxAgeSessionMicro",
        settingValue: "5",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityMaxAgeWorkTimeMicroAfterMicro",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedModel1MaxUsedPattenUsedCount",
        settingValue: "1",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityMaxUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityMaxTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityMaxStopLossUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxDrivenPattenUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxDrivenPattenTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxDrivenPattenStopLossUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxMSSUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxMSSTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxMSSStopLossUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxCOBUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxCOBTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "Int",
      },
      {
        settingKey: "LiquidityUsedMaxCOBStopLossUsedCount",
        settingValue: "2",
        parseTo: "Int",
      },
      {
        settingKey: "LiquiditySMTAbilityTimeDiffMinutes",
        settingValue: "60",
        parseTo: "Int",
      },
    ],
  });
}

async function setTimeStuff() {
  await prisma.$executeRaw`TRUNCATE TABLE Session`;
  await prisma.$executeRaw`TRUNCATE TABLE WorkTime`;
  await prisma.$executeRaw`TRUNCATE TABLE TimeMicro`;

  await prisma.session.create({
    data: { title: "Asia", start: "00:00", end: "05:30" },
  });
  await prisma.session.create({
    data: {
      title: "London",
      start: "05:45",
      end: "10:00",
      workTimes: {
        createMany: {
          data: [
            { title: "London Work Time 1", start: "05:45", end: "08:00" },
            { title: "London Work Time 2", start: "08:45", end: "09:30" },
          ],
        },
      },
    },
  });
  await prisma.session.create({
    data: {
      title: "NewYork 1",
      start: "10:45",
      end: "16:00",
      workTimes: {
        createMany: {
          data: [
            { title: "NewYork Work Time 1", start: "10:45", end: "13:00" },
            { title: "NewYork Work Time 2", start: "13:45", end: "14:30" },
          ],
        },
      },
    },
    include: { workTimes: true },
  });
  await prisma.session.create({
    data: {
      title: "NewYork 2",
      start: "16:45",
      end: "19:00",
      workTimes: {
        createMany: {
          data: [
            { title: "NewYork Work Time 1", start: "16:45", end: "18:00" },
          ],
        },
      },
    },
  });
}

async function setCurrencies() {
  await prisma.$executeRaw`TRUNCATE TABLE Currency`;
  await prisma.currency.createMany({
    data: [{ name: "EURUSD" }, { name: "GBPUSD" }],
  });

  const GBPUSD = await prisma.currency.findFirst({ where: { name: "GBPUSD" } });
  const EURUSD = await prisma.currency.findFirst({ where: { name: "EURUSD" } });

  if (EURUSD && GBPUSD) {
    await prisma.currency.update({
      where: { id: EURUSD.id },
      data: { relatedTo: { connect: { id: GBPUSD.id } } },
    });
    await prisma.currency.update({
      where: { id: GBPUSD.id },
      data: { relatedTo: { connect: { id: EURUSD.id } } },
    });
  }
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
