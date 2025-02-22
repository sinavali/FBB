module.exports = {
  transform: {
    "^.+\\.tsx?$": "babel-jest", // Use babel-jest for .ts and .tsx files
  },
  testEnvironment: "node", // Use Node.js environment for testing
  moduleNameMapper: {
    "^@tradingBot/(.*)$": "<rootDir>/Packages/TradingBot/$1", // Map @tradingBot/* to Packages/TradingBot/*
    "^@shared/(.*)$": "<rootDir>/Shared/$1", // Map @shared/* to Packages/Shared/*
  },
  moduleFileExtensions: ["ts", "tsx", "js"], // Add .ts and .tsx to supported file extensions
  roots: ["<rootDir>/Packages"], // Tell Jest to look for tests in the Packages directory
};
