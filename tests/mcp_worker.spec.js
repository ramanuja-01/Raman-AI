const { test, expect } = require('@playwright/test');
const { loadRamanApp } = require('./helpers');

test.describe('Milestone 1: Web Worker Multi-Agent MCP Hub & Dynamic MLP Scaling', () => {

  test('should verify window.RamanMcpWorkerClient and RamanOnnxReranker are loaded in page', async ({ page }) => {
    await loadRamanApp(page);

    const clientStatus = await page.evaluate(() => {
      return {
        hasMcpWorkerClient: !!window.RamanMcpWorkerClient,
        hasOnnxReranker: !!window.RamanOnnxReranker,
        hasClassifier: !!window.slmClassifier,
        hasExpandCapacity: typeof window.slmClassifier.expandModelCapacity === 'function'
      };
    });

    expect(clientStatus.hasMcpWorkerClient).toBe(true);
    expect(clientStatus.hasOnnxReranker).toBe(true);
    expect(clientStatus.hasClassifier).toBe(true);
    expect(clientStatus.hasExpandCapacity).toBe(true);
  });

  test('should execute dynamic model capacity scaling in browser without regression', async ({ page }) => {
    await loadRamanApp(page);

    const expansionResult = await page.evaluate(() => {
      const initialConditions = window.slmClassifier.conditions.length;
      const res = window.slmClassifier.expandModelCapacity(32, 1600);
      return {
        initialConditions,
        res,
        newW4Cols: window.slmClassifier.mlpW4[0].length,
        h1: window.slmClassifier.H1,
        h2: window.slmClassifier.H2,
        h3: window.slmClassifier.H3
      };
    });

    expect(expansionResult.h1).toBe(64);
    expect(expansionResult.h2).toBe(32);
    expect(expansionResult.h3).toBe(16);
    expect(expansionResult.newW4Cols).toBe(32);
  });

  test('should execute MCP multi-agent pipeline via worker client in browser', async ({ page }) => {
    await loadRamanApp(page);

    const mcpResult = await page.evaluate(async () => {
      if (!window.RamanMcpWorkerClient) return { error: "No client" };
      const worker = window.RamanMcpWorkerClient.getWorker();
      if (!worker) return { error: "Could not create worker" };

      const res = await window.RamanMcpWorkerClient.request("mcp/ingestAndRetrain", {
        datasetKey: "otitis",
        conditionKey: "ear infection",
        corpus: ["i have severe ear pain and fluid coming out of ear otitis"],
        kb: {
          icd11: "AA30",
          medications: [{ name: "Ofloxacin 0.3% Otic", snomed: "387207008", dose: "5 drops bid" }]
        },
        masterCorpus: window.SLM_TRAINING_CORPUS
      });

      return {
        status: res.status,
        conditionKey: res.compilation.conditionKey,
        icd11: res.compilation.icd11,
        phrasesIngested: res.ingestion.phrasesIngested
      };
    });

    expect(mcpResult.status).toBe("SUCCESS");
    expect(mcpResult.conditionKey).toBe("ear infection");
    expect(mcpResult.icd11).toBe("AA30");
    expect(mcpResult.phrasesIngested).toBe(1);
  });

});
