// Shared browser configuration for the Marble capture and acceptance scripts.
// Resolve a local Playwright install (or NODE_PATH); never assume a user's home.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseURL = (process.env.MARBLE_BASE_URL || 'http://127.0.0.1:9988').replace(/\/$/, '');

function launchBrowser() {
  const options = {
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  };
  if (process.platform === 'darwin') options.args.push('--use-angle=metal');
  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    options.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  }
  return chromium.launch(options);
}

async function chooseDestination(page, id) {
  await page.click('#destination-toggle');
  await page.click(`[data-destination="${id}"]`);
}

async function switchWalkIsland(page, id) {
  if (await page.locator('#stage').getAttribute('data-walk') === id) return;
  await page.click('#walk-place');
  await page.click(`[data-walk-place="${id}"]`);
}

module.exports = {baseURL, launchBrowser, chooseDestination, switchWalkIsland};
