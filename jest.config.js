const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jsdom",
  testMatch: [
    "**/__tests__/**/*.(test|spec).(js|jsx|ts|tsx)",
    "**/*.(test|spec).(js|jsx|ts|tsx)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@prisma/client$": "<rootDir>/generated/prisma/index.js",
    "^@prisma/adapter-d1$": "<rootDir>/__mocks__/@prisma/adapter-d1.ts",
  },
  // Coverage settings
  collectCoverage: false,
  collectCoverageFrom: [
    "app/**/*.{js,jsx,ts,tsx}",
    "components/**/*.{js,jsx,ts,tsx}",
    "features/**/*.{js,jsx,ts,tsx}",
    "hooks/**/*.{js,jsx,ts,tsx}",
    "lib/**/*.{js,jsx,ts,tsx}",
    "shared/**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/__tests__/**",
    "!**/*.test.{js,jsx,ts,tsx}",
    "!**/*.spec.{js,jsx,ts,tsx}",
    "!**/coverage/**",
    "!**/build/**",
    "!**/.next/**",
    "!**/docs/**",
    "!**/prisma/**",
    "!**/generated/**",
    "!app/**/layout.{js,jsx,ts,tsx}",
    "!app/**/loading.{js,jsx,ts,tsx}",
    "!app/**/error.{js,jsx,ts,tsx}",
    "!app/**/not-found.{js,jsx,ts,tsx}",
    "!app/globals.css",
    "!**/middleware.{js,ts}",
    "!next.config.{js,mjs}",
    "!tailwind.config.{js,ts}",
    "!postcss.config.{js,mjs}",
  ],
  coverageDirectory: "coverage",
  coverageReporters: [
    "text",
    "text-summary",
    "lcov",
    "json",
    "json-summary",
    [
      "html",
      {
        subdir: "html",
        skipCovered: false,
        skipFull: false,
      },
    ],
    ["cobertura", { file: "coverage.xml" }],
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Performance optimizations
  maxWorkers: "50%",
  testTimeout: 10_000,
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  // Test result processor
  verbose: false,
  // Ignore patterns
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/node_modules/",
    "<rootDir>/coverage/",
    "<rootDir>/build/",
  ],
  // Transform ignore patterns for ES modules
  transformIgnorePatterns: [
    "node_modules/(?!(.*\\.mjs$|@tanstack|lucide-react|date-fns|japanese-holidays|jose))",
  ],
  // Global setup for tests
  globalSetup: undefined,
  globalTeardown: undefined,
  // Error handling
  errorOnDeprecated: true,
  // Coverage visualization enhancements
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/build/",
    "/.next/",
    "/coverage/",
  ],
  // CI/CD optimizations
  ci: process.env.CI === "true",
  detectOpenHandles: process.env.CI !== "true",
};

module.exports = createJestConfig(customJestConfig);
