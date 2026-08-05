module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "js"],
  moduleNameMapper: {
    "\\.(less|css)$": "<rootDir>/tests/style-stub.js"
  },
  collectCoverageFrom: ["src/**/*.ts"],
  coveragePathIgnorePatterns: ["/node_modules/", "/src/index.ts$"]
};
