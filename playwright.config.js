const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 30000,
  expect: {
    timeout: 7000
  },
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3456',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node tests/server.js',
    url: 'http://127.0.0.1:3456',
    reuseExistingServer: true,
    timeout: 10000
  },
  projects: [
    {
      name: 'Desktop Chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 }
      }
    },
    {
      name: 'Mobile Android (Pixel 7)',
      use: {
        ...devices['Pixel 7'],
        hasTouch: true,
        isMobile: true
      }
    },
    {
      name: 'Mobile iOS (iPhone 14)',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        hasTouch: true,
        isMobile: true
      }
    }
  ]
});
