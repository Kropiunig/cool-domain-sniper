import dns from 'dns/promises';
import net from 'net';

// --- Primary: EPP-level check via domains.revved.com ---
// This is the same source of truth registrars use. Supports all TLDs.

async function checkEpp(domain) {
  try {
    const url = `https://domains.revved.com/v1/domainStatus?domains=${encodeURIComponent(domain)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.namecheap.com/',
        'Origin': 'https://www.namecheap.com',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { method: 'epp', available: null, reason: `HTTP ${res.status}` };

    const data = await res.json();
    const entry = data.status?.find(s => s.name === domain);
    if (!entry) return { method: 'epp', available: null, reason: 'domain not in response' };

    const result = {
      method: 'epp',
      available: entry.available,
      ...(entry.reason ? { note: entry.reason } : {}),
    };
    if (entry.premium && entry.fee) {
      result.premium = true;
      result.eppPrice = `$${entry.fee.amount}/yr`;
    }
    return result;
  } catch (err) {
    return { method: 'epp', available: null, reason: err.message };
  }
}

// --- Fallback 1: RDAP ---

let rdapBootstrap = null;

async function loadBootstrap() {
  if (rdapBootstrap) return rdapBootstrap;
  try {
    const res = await fetch('https://data.iana.org/rdap/dns.json');
    const data = await res.json();
    rdapBootstrap = {};
    for (const [tlds, urls] of data.services) {
      for (const tld of tlds) {
        rdapBootstrap[tld] = urls[0];
      }
    }
  } catch {
    rdapBootstrap = {
      com: 'https://rdap.verisign.com/com/v1/',
      net: 'https://rdap.verisign.com/net/v1/',
      org: 'https://rdap.org.rdap.org/',
      dev: 'https://pubapi.registry.google/rdap/',
      app: 'https://pubapi.registry.google/rdap/',
    };
  }
  return rdapBootstrap;
}

function extractTld(domain) {
  return domain.split('.').pop();
}

async function checkRdap(domain) {
  const bootstrap = await loadBootstrap();
  const server = bootstrap[extractTld(domain)];
  if (!server) return { method: 'rdap', available: null, reason: 'no RDAP server' };

  const url = `${server.replace(/\/$/, '')}/domain/${domain}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      try {
        const body = await res.json();
        const desc = (body.description ?? []).join(' ').toLowerCase();
        if (desc.includes('blocked') || desc.includes('reserved') || desc.includes('not available')) {
          return { method: 'rdap', available: false, note: body.description?.join('; ') };
        }
      } catch {}
      return { method: 'rdap', available: true };
    }
    if (res.ok) return { method: 'rdap', available: false };
    return { method: 'rdap', available: null, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { method: 'rdap', available: null, reason: err.message };
  }
}

// --- Fallback 2: DNS NS records ---

async function checkDns(domain) {
  try {
    const ns = await dns.resolveNs(domain);
    if (ns.length > 0) return { method: 'dns', available: false };
  } catch (err) {
    if (err.code === 'ENOTFOUND') return { method: 'dns', available: true };
    if (err.code !== 'ENODATA') return { method: 'dns', available: null, reason: err.code };
  }
  return { method: 'dns', available: null, reason: 'inconclusive' };
}

// --- Main check: EPP first, then fallbacks ---

export async function checkDomain(domain) {
  // 1. EPP check — authoritative for ALL TLDs
  const epp = await checkEpp(domain);
  if (epp.available !== null) {
    return { domain, ...epp };
  }

  // 2. RDAP fallback
  const rdap = await checkRdap(domain);
  if (rdap.available !== null) {
    return { domain, ...rdap };
  }

  // 3. DNS NS fallback
  const dnsResult = await checkDns(domain);
  if (dnsResult.available !== null) {
    return { domain, ...dnsResult, note: 'DNS fallback — verify before purchasing' };
  }

  return { domain, method: 'unknown', available: null, reason: 'all checks inconclusive' };
}

export async function warmupBootstrap() {
  await loadBootstrap();
}
