const DB_ID = '2e2d8fce2e1880bea6b5fe0c8233ab79';

function getProp(props, name, type) {
  const p = props[name];
  if (!p) return null;
  if (type === 'title') return (p.title || []).map(t => t.plain_text).join('') || '';
  if (type === 'select') return (p.select && p.select.name) || null;
  if (type === 'status') return (p.status && p.status.name) || null;
  if (type === 'rich_text') return (p.rich_text || []).map(t => t.plain_text).join('') || '';
  return null;
}

exports.handler = async function() {
  const token = process.env.NOTION_TOKEN;
  if (!token) return {
    statusCode: 500,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: 'NOTION_TOKEN not set in Netlify environment variables' })
  };

  try {
    let allPages = [], cursor, hasMore = true;
    while (hasMore) {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch('https://api.notion.com/v1/databases/' + DB_ID + '/query', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) return {
        statusCode: res.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: data.message || 'Notion API error', code: data.code })
      };
      allPages = allPages.concat(data.results);
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    const fieldNames = allPages.length > 0 ? Object.keys(allPages[0].properties) : [];

    const clients = allPages.map(p => {
      const props = p.properties;
      const name = getProp(props, 'Client Name', 'title')
        || getProp(props, 'Name', 'title')
        || getProp(props, 'Client', 'title') || 'Unknown';
      const status = getProp(props, 'Contract Status', 'status')
        || getProp(props, 'Contract Status', 'select')
        || getProp(props, 'Status', 'status')
        || getProp(props, 'Status', 'select') || null;
      const notes = getProp(props, 'Contract Notes', 'rich_text')
        || getProp(props, 'Notes', 'rich_text') || '';
      const clientType = getProp(props, 'Client Type', 'select')
        || getProp(props, 'Tier', 'select')
        || getProp(props, 'Type', 'select')
        || getProp(props, 'Service Tier', 'select') || 'Other';
      return { id: p.id, name, status, notes, clientType };
    });

    clients.sort((a, b) => a.name.localeCompare(b.name));

    const grouped = {}, groupOrder = [];
    clients.forEach(c => {
      const t = c.clientType || 'Other';
      if (!grouped[t]) { grouped[t] = []; groupOrder.push(t); }
      grouped[t].push(c);
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=60' },
      body: JSON.stringify({ ok: true, total: clients.length, fieldNames, grouped, groupOrder, clients })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
