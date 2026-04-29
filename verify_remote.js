const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Navigating to ComfyStudio...');
  await page.goto('http://localhost:5173');

  // Open Settings
  console.log('Opening settings...');
  await page.click('button:has-text("Settings"), [aria-label="Settings"]');

  // Wait for connection tab and input the address
  console.log('Entering ComfyUI address...');
  const addressInput = page.locator('input[placeholder*="127.0.0.1"]');
  await addressInput.fill('https://pro5091.proai123.com');

  // Click Test
  console.log('Testing connection...');
  await page.click('button:has-text("Test")');

  // Wait for status message
  await page.waitForTimeout(3000);
  const statusMessage = await page.locator('.text-sf-text-muted.truncate, .text-xs.text-sf-text-muted').textContent();
  console.log('Status after test:', statusMessage);

  await page.screenshot({ path: 'settings_test.png' });

  if (statusMessage.includes('Connected')) {
    console.log('Connection successful! Navigating to Generate tab...');
    await page.click('button:has-text("Settings")'); // Close modal
    await page.click('button:has-text("Generate")');

    await page.waitForTimeout(2000);
    const queueButton = page.locator('button:has-text("Queue Video")');
    const isEnabled = await queueButton.isEnabled();
    console.log('Queue Video button is enabled:', isEnabled);

    await page.screenshot({ path: 'generate_tab.png' });
  } else {
    console.log('Connection failed, skipping generate tab test.');
  }

  await browser.close();
})();
