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
      { settingKey: "SystemMode", settingValue: "BACKTEST", parseTo: "STRING" },
      { settingKey: "RiskReward", settingValue: "2", parseTo: "FLOAT" },
      { settingKey: "SignalLoss", settingValue: "1", parseTo: "FLOAT" },
      {
        settingKey: "SignalStopLossError",
        settingValue: "0.005",
        parseTo: "FLOAT",
      },
      {
        settingKey: "SignalTakeProfitError",
        settingValue: "0.005",
        parseTo: "FLOAT",
      },
      {
        settingKey: "SignalNoNewTriggerWhenThereIsOne",
        settingValue: "0",
        parseTo: "BOOLEAN",
      },
      { settingKey: "COBPostStartCount", settingValue: "1", parseTo: "INT" },
      { settingKey: "COBBodyCount", settingValue: "3", parseTo: "INT" },
      { settingKey: "COBPastConfirmCount", settingValue: "3", parseTo: "INT" },
      {
        settingKey: "COBCandlesFromConfirmToDetermineLimitCount",
        settingValue: "6",
        parseTo: "INT",
      },
      {
        settingKey: "COBPastConfirmCandlesCount",
        settingValue: "10",
        parseTo: "INT",
      },
      {
        settingKey: "SystemBrokerTimezoneName",
        settingValue: "Europe/Moscow",
        parseTo: "STRING",
      },
      {
        settingKey: "MSSHeightLimitDivider",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "MSSMultipleFVGHeightLimitDivider",
        settingValue: "2",
        parseTo: "INT",
      },
      { settingKey: "MSSSmallHeightLimit", settingValue: "4", parseTo: "INT" },
      { settingKey: "MSSBigHeightLimit", settingValue: "11", parseTo: "INT" },
      {
        settingKey: "MSSSecondDeepToMssCandleDiff",
        settingValue: "50",
        parseTo: "INT",
      },
      {
        settingKey: "MSSMssCandleToTriggerCandleDiff",
        settingValue: "50",
        parseTo: "INT",
      },
      { settingKey: "COBStopHeightLimit", settingValue: "10", parseTo: "INT" },
      {
        settingKey: "DPCorrelationByFirstWaveMaxDiffTime",
        settingValue: "2.5",
        parseTo: "INT",
      },
      { settingKey: "DPMinWavesCount", settingValue: "3", parseTo: "INT" },
      { settingKey: "DPMaxWavesCount", settingValue: "5", parseTo: "INT" },
      {
        settingKey: "DPMatchDiffCandleCount",
        settingValue: "10",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityMaxAgeSessionMicro",
        settingValue: "5",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityMaxAgeWorkTimeMicro",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedModel1MaxUsedPattenUsedCount",
        settingValue: "1",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityMaxUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityMaxTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityMaxStopLossUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxDrivenPattenUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxDrivenPattenTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxDrivenPattenStopLossUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxMSSUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxMSSTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxMSSStopLossUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxCOBUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxCOBTakeProfitUsedCount",
        settingValue: "1",
        parseTo: "INT",
      },
      {
        settingKey: "LiquidityUsedMaxCOBStopLossUsedCount",
        settingValue: "2",
        parseTo: "INT",
      },
      {
        settingKey: "LiquiditySMTAbilityTimeDiffMinutes",
        settingValue: "60",
        parseTo: "INT",
      },
      {
        settingKey: "CandleDirectionBuff",
        settingValue: "0.05",
        parseTo: "FLOAT",
      },
      {
        settingKey: "LiquidityPullbackPercent",
        settingValue: "25",
        parseTo: "INT",
      },
      {
        settingKey: "BotTimezone",
        settingValue: "America/New_York",
        parseTo: "STRING",
      },
      {
        settingKey: "BackTestStartUTCUnix",
        settingValue: "1546350000",
        parseTo: "INT",
      },
      {
        settingKey: "BackTestEndUTCUnix",
        settingValue: "1546650000",
        parseTo: "INT",
      },
    ],
  });
}

async function setTimeStuff() {
  await prisma.$executeRaw`TRUNCATE TABLE Session`;
  await prisma.$executeRaw`TRUNCATE TABLE WorkTime`;
  await prisma.$executeRaw`TRUNCATE TABLE TimeMicro`;

  await prisma.session.createMany({
    data: [
      { title: "Asia", start: "00:00", end: "05:30" },
      {
        title: "London",
        start: "05:45",
        end: "10:00",
      },
      {
        title: "NewYork 1",
        start: "10:45",
        end: "16:00",
      },
      {
        title: "NewYork 2",
        start: "16:45",
        end: "19:00",
      },
    ],
  });
  await prisma.workTime.createMany({
    data: [
      { title: "London Work Time 1", start: "05:45", end: "08:00" },
      { title: "London Work Time 2", start: "08:45", end: "09:30" },
      { title: "NewYork Work Time 1", start: "10:45", end: "13:00" },
      { title: "NewYork Work Time 2", start: "13:45", end: "14:30" },
      { title: "NewYork Work Time 1", start: "16:45", end: "18:00" },
    ],
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
