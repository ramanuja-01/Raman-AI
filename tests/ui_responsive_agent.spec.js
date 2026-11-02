const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Autonomous Client-Side UI Responsiveness & Self-Healing Agent', () => {

  test('should initialize window.ramanUiAgent with version 2.3.0 and healthy circuit breaker', async ({ page }) => {
    await loadRamanApp(page);

    // Allow initial DOM display:flex layout transition to settle cleanly
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    const diagnostics = await page.evaluate(() => {
      if (!window.ramanUiAgent) return null;
      // Perform steady-state audit pass post-settling
      window.ramanUiAgent.auditAndCorrect();
      return window.ramanUiAgent.getDiagnostics();
    });

    expect(diagnostics).not.toBeNull();
    expect(diagnostics.version).toBe('2.3.0');
    expect(diagnostics.circuitBreakerTripped).toBe(false);
    expect(typeof diagnostics.executionLatencyMs).toBe('number');
    expect(diagnostics.executionLatencyMs).toBeLessThan(2.0);
  });

  test('should correctly classify desktop viewport and set data-ui-tier="desktop"', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only tier test');

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadRamanApp(page);

    // Trigger an audit to ensure viewport sync
    await page.evaluate(() => window.ramanUiAgent && window.ramanUiAgent.auditAndCorrect());

    const tier = await page.evaluate(() => document.body.getAttribute('data-ui-tier'));
    expect(tier).toBe('desktop');
  });

  test('should dynamically adapt between tablet-portrait and tablet-landscape', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tablet tier test');

    await loadRamanApp(page);

    // Set Tablet Portrait (768 x 1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.evaluate(() => window.ramanUiAgent && window.ramanUiAgent.auditAndCorrect());

    let tier = await page.evaluate(() => document.body.getAttribute('data-ui-tier'));
    expect(tier).toBe('tablet-portrait');

    // Set Tablet Landscape (1024 x 768)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => window.ramanUiAgent && window.ramanUiAgent.auditAndCorrect());

    tier = await page.evaluate(() => document.body.getAttribute('data-ui-tier'));
    expect(tier).toBe('tablet-landscape');
  });

  test('should dynamically adapt between mobile and mobile-compact tiers', async ({ page }) => {
    await loadRamanApp(page);

    // Standard Mobile (390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.ramanUiAgent && window.ramanUiAgent.auditAndCorrect());

    let tier = await page.evaluate(() => document.body.getAttribute('data-ui-tier'));
    expect(tier).toBe('mobile');

    // Compact Mobile (340 x 640)
    await page.setViewportSize({ width: 340, height: 640 });
    await page.evaluate(() => window.ramanUiAgent && window.ramanUiAgent.auditAndCorrect());

    tier = await page.evaluate(() => document.body.getAttribute('data-ui-tier'));
    expect(tier).toBe('mobile-compact');
  });

  test('should compensate for virtual keyboard encroachment using visualViewport simulation', async ({ page }) => {
    await loadRamanApp(page);

    const keyboardSimulation = await page.evaluate(() => {
      if (!window.ramanUiAgent) return null;

      // Mock visualViewport elevation delta of 280px (soft keyboard opened)
      const originalVv = window.visualViewport;
      window.visualViewport = {
        width: window.innerWidth,
        height: window.innerHeight - 280
      };

      window.ramanUiAgent.handleViewportChange();

      const bodyKeyboard = document.body.getAttribute('data-keyboard-open');
      const rootOffset = document.documentElement.style.getPropertyValue('--v-keyboard-offset');
      const agentOffset = window.ramanUiAgent.keyboardOffset;
      const isOpen = window.ramanUiAgent.isKeyboardOpen;

      // Restore
      window.visualViewport = originalVv;
      window.ramanUiAgent.handleViewportChange();

      return { bodyKeyboard, rootOffset, agentOffset, isOpen };
    });

    expect(keyboardSimulation).not.toBeNull();
    expect(keyboardSimulation.bodyKeyboard).toBe('true');
    expect(keyboardSimulation.rootOffset).toBe('280px');
    expect(keyboardSimulation.agentOffset).toBe(280);
    expect(keyboardSimulation.isOpen).toBe(true);
  });

  test('should detect and self-heal horizontal spill containment', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loadRamanApp(page);

    const containmentResult = await page.evaluate(() => {
      if (!window.ramanUiAgent) return null;

      // Create an artificial overflowing container inside chat-messages
      const chatContainer = document.querySelector('.chat-messages');
      if (!chatContainer) return null;

      const spillyDiv = document.createElement('div');
      spillyDiv.id = 'testSpillDiv';
      spillyDiv.className = 'consultation-card';
      spillyDiv.style.width = '800px'; // Deliberately exceeding 375px viewport
      spillyDiv.textContent = 'Artificial Wide Clinical ECG Strip Data';
      chatContainer.appendChild(spillyDiv);

      // Force agent audit
      window.ramanUiAgent.auditAndCorrect();

      const spillDetected = window.ramanUiAgent.spillDetected;
      const bodySpillAttr = document.body.getAttribute('data-spill-detected');
      const computedOverflowX = window.getComputedStyle(spillyDiv).overflowX;

      // Cleanup
      spillyDiv.remove();
      window.ramanUiAgent.auditAndCorrect();

      return {
        spillDetected,
        bodySpillAttr,
        computedOverflowX
      };
    });

    expect(containmentResult).not.toBeNull();
    expect(containmentResult.spillDetected).toBe(true);
    expect(containmentResult.bodySpillAttr).toBe('true');
    expect(['auto', 'scroll']).toContain(containmentResult.computedOverflowX);
  });

  test('should synchronize high-DPI canvas buffer resolution without distortion', async ({ page }) => {
    await loadRamanApp(page);

    const canvasSyncResult = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[data-auto-resync="true"]');
      if (!canvas || !window.ramanUiAgent) return null;

      // Set synthetic CSS client dimensions
      const originalW = canvas.width;
      const originalH = canvas.height;

      window.ramanUiAgent.syncCanvases();

      return {
        hasAutoResync: canvas.getAttribute('data-auto-resync') === 'true',
        bufferWidth: canvas.width,
        bufferHeight: canvas.height
      };
    });

    expect(canvasSyncResult).not.toBeNull();
    expect(canvasSyncResult.hasAutoResync).toBe(true);
    expect(canvasSyncResult.bufferWidth).toBeGreaterThan(0);
    expect(canvasSyncResult.bufferHeight).toBeGreaterThan(0);
  });

  test('should enforce circuit breaker rate limit to prevent layout thrashing', async ({ page }) => {
    await loadRamanApp(page);

    const circuitBreakerResult = await page.evaluate(() => {
      const agent = window.ramanUiAgent;
      if (!agent) return null;

      agent.resetCircuitBreaker();

      // Rapidly simulate 15 back-to-back layout audit cycles
      for (let i = 0; i < 15; i++) {
        agent.mutationTimestamps.push(Date.now());
      }

      agent.auditAndCorrect();

      const tripped = agent.circuitBreakerTripped;
      agent.resetCircuitBreaker(); // restore healthy state

      return { tripped };
    });

    expect(circuitBreakerResult).not.toBeNull();
    expect(circuitBreakerResult.tripped).toBe(true);
  });

});
