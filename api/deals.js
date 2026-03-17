export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { zip } = req.query;
  if (!zip || zip.length !== 5 || isNaN(zip)) {
    return res.status(400).json({ error: 'Invalid ZIP' });
  }

  try {
    const url = `https://www.homedepot.com/s/clearance?NCNI-5&zipcode=${zip}&Nao=0`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!resp.ok) throw new Error(`HD page ${resp.status}`);
    const html = await resp.text();
    const items = parseProducts(html);

    if (items.length > 0) return res.status(200).json({ items, zip, total: items.length });

    const ssItems = await trySearchspring(zip);
    return res.status(200).json({ items: ssItems, zip, total: ssItems.length });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function parseProducts(html) {
  const items = [];
  try {
    const patterns = [
      /window\.__REDUX_STATE__\s*=\s*({[\s\S]+?});\s*(?:window|<\/script>)/,
      /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]+?});\s*(?:window|<\/script>)/,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) { try { return extractProducts(JSON.parse(m[1])); } catch (_) {} }
    }
  } catch (_) {}
  return items;
}

function extractProducts(obj, items = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || items.length > 60) return items;
  if (obj.itemId && obj.pricing && !seen.has(obj.itemId)) {
    seen.add(obj.itemId);
    const price = parseFloat(obj.pricing?.value || 0);
    const original = parseFloat(obj.pricing?.original || price);
    if (price > 0) items.push({ id: obj.itemId, name: obj.identifiers?.productLabel || 'Product', brand: obj.identifiers?.brandName || '', sku: obj.identifiers?.storeSkuNumber || obj.itemId, price, originalPrice: original, percentOff: original > price ? Math.round((1 - price/original)*100) : 0, isPenny: price <= 0.01, image: obj.media?.images?.[0]?.url || null, url: `https://www.homedepot.com/p/${obj.itemId}`, category: 'Clearance' });
  }
  for (const k of Object.keys(obj)) if (typeof obj[k] === 'object') extractProducts(obj[k], items, seen);
  return items;
}

async function trySearchspring(zip) {
  try {
    const r = await fetch(`https://search.homedepot.com/boost/prods?q=clearance&siteId=hdep&resultsPerPage=48&zipCode=${zip}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d?.results || []).slice(0, 48).map(p => {
      const price = parseFloat(p.ss_sale_price || p.price || 0);
      const original = parseFloat(p.price || price);
      return { id: p.uid || p.id, name: p.name || 'Product', brand: p.brand || '', sku: p.sku || p.uid || '', price, originalPrice: original, percentOff: original > price ? Math.round((1-price/original)*100) : 0, isPenny: price <= 0.01, image: p.imageUrl || null, url: p.url || `https://www.homedepot.com/p/${p.uid}`, category: p.category || 'Clearance' };
    }).filter(p => p.price > 0);
  } catch (_) { return []; }
}
