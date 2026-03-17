export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { zip } = req.query;
  if (!zip || zip.length !== 5) return res.status(400).json({ error: 'Invalid ZIP' });

  try {
    let storeId = '121';
    try {
      const sr = await fetch(`https://www.homedepot.com/store-finder/services/stores?zipCode=${zip}&radius=50`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (sr.ok) { const sd = await sr.json(); const s = sd?.stores?.[0] || sd?.[0]; if (s?.storeId) storeId = String(s.storeId); }
    } catch (_) {}

    const body = { operationName: "searchModel", variables: { storefilter: "ALL", channel: "DESKTOP", skipInstallProducts: false, skipKPF: false, skipSpecificationGroup: true, skipSubscribeAndSave: false, storeId, zipCode: zip, pageSize: 48, startIndex: 0, keyword: "clearance", filter: { isOnSale: true }, additionalSearchParams: { sponsored: false } }, query: `query searchModel($storeId: String, $zipCode: String, $keyword: String, $pageSize: Int, $startIndex: Int, $filter: InputFilter) { searchModel(keyword: $keyword, storeId: $storeId, zipCode: $zipCode) { products(pageSize: $pageSize, startIndex: $startIndex, filter: $filter) { results { itemId identifiers { storeSkuNumber productLabel brandName } pricing(storeId: $storeId) { value original percentageOff } media { images { url } } } metadata { total } } } }` };

    const r = await fetch('https://www.homedepot.com/federation-gateway/graphql?opname=searchModel', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Current-Url': '/s/clearance', 'apollographql-client-name': 'search-ui', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json', 'Origin': 'https://www.homedepot.com', 'Referer': 'https://www.homedepot.com/s/clearance' }, body: JSON.stringify(body) });

    if (!r.ok) throw new Error(`HD API ${r.status}`);
    const d = await r.json();
    const raw = d?.data?.searchModel?.products?.results || [];

    const items = raw.filter(p => p.pricing?.value != null).map(p => {
      const price = parseFloat(p.pricing.value);
      const original = parseFloat(p.pricing.original || p.pricing.value);
      return { id: p.itemId, name: p.identifiers?.productLabel || 'Product', brand: p.identifiers?.brandName || '', sku: p.identifiers?.storeSkuNumber || p.itemId, price, originalPrice: original, percentOff: parseFloat(p.pricing.percentageOff || 0), isPenny: price <= 0.01, image: p.media?.images?.[0]?.url || null, url: `https://www.homedepot.com/p/${p.itemId}`, category: 'Clearance' };
    });

    return res.status(200).json({ items, storeId, zip, total: items.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
