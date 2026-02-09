import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { checkDomain, warmupBootstrap } from './checker.js';
import { generateDomains } from './generator.js';
import { formatPrice, isAffordable } from './pricing.js';
import {
  loadResults,
  saveResults,
  wasChecked,
  markChecked,
  addResult,
  getStats,
  printBanner,
  printAvailable,
  printTaken,
  printError,
  printStats,
  printSaving,
  printSaved,
} from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadConfig() {
  const raw = await readFile(join(__dirname, '..', 'config.json'), 'utf8');
  return JSON.parse(raw);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  printBanner();

  const config = await loadConfig();
  console.log(`  Config: ${config.tlds.join(', ')}`);
  console.log(`  Max price: $${config.maxPricePerYear}/yr`);
  console.log(`  Keywords: ${config.keywords.join(', ')}`);
  console.log(`  Names: ${config.personalNames.join(', ')}`);
  console.log(`  Strategies: ${config.strategies.join(', ')}`);
  console.log();

  // Load previous results
  await loadResults();
  const stats = getStats();
  if (stats.checked > 0) {
    console.log(`  Resuming: ${stats.checked} already checked, ${stats.found} found so far\n`);
  }

  // Warm up RDAP bootstrap
  process.stdout.write('  Loading RDAP bootstrap...');
  await warmupBootstrap();
  console.log(' done!\n');

  // Auto-save interval
  let saveCounter = 0;
  const SAVE_EVERY = 50;

  // Handle Ctrl+C gracefully
  let stopping = false;
  process.on('SIGINT', async () => {
    if (stopping) process.exit(1);
    stopping = true;
    printSaving();
    await saveResults();
    const s = getStats();
    printSaved(s.found);
    printStats(s.checked, s.found);
    process.exit(0);
  });

  // Main loop
  const generator = generateDomains(config);
  for await (const { domain, strategy } of generator) {
    if (stopping) break;

    // Skip already checked
    if (wasChecked(domain)) continue;

    // Skip unaffordable TLDs
    const tld = '.' + domain.split('.').pop();
    if (!isAffordable(tld, config.maxPricePerYear)) continue;

    // Rate limit
    await sleep(config.requestDelayMs);

    // Check availability
    const result = await checkDomain(domain);
    markChecked(domain);

    if (result.available === true) {
      const price = result.eppPrice ?? formatPrice(tld);
      const premium = result.premium ? ' [PREMIUM]' : '';
      printAvailable(domain, strategy, price + premium);
      addResult({
        domain,
        strategy,
        price,
        tld,
        premium: result.premium ?? false,
        checkedAt: new Date().toISOString(),
      });
      // Save immediately when we find something
      await saveResults();
    } else if (result.available === false) {
      printTaken(domain);
    } else {
      printError(domain, result.reason ?? 'unknown');
    }

    // Auto-save checked list periodically
    saveCounter++;
    if (saveCounter >= SAVE_EVERY) {
      await saveResults();
      saveCounter = 0;
    }
  }

  // Final save
  printSaving();
  await saveResults();
  const finalStats = getStats();
  printSaved(finalStats.found);
  printStats(finalStats.checked, finalStats.found);
  console.log('  All domain combinations exhausted. Edit config.json to add more!\n');
}

main().catch(err => {
  console.error('\n  Fatal error:', err.message);
  process.exit(1);
});
