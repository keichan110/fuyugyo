/**
 * Mock for @opennextjs/cloudflare
 * テスト環境ではCloudflare環境は不要なのでモック化
 */

export const getCloudflareContext = async () => ({
  env: {},
  cf: {},
  ctx: {
    waitUntil: () => {
      // no-op for testing
    },
    passThroughOnException: () => {
      // no-op for testing
    },
  },
});
