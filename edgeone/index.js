/**
 * Tencent EdgeOne IP & Geo Worker (Production Fixed)
 * 适配：ip.bravexist.cn
 * 修复：根据真实 debug 数据修正了字段映射 (cisp, countryName, cityName)
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// 1. 数据提取核心逻辑 (精确匹配)
function getEdgeOneData(request) {
  const eo = request.eo || {};
  const geo = eo.geo || {};

  return {
    // IP 地址
    ip: eo.clientIp || 'Unknown',

    // 地理位置 (根据 Debug 结果修正)
    country: geo.countryName || 'N/A',
    countryCode: geo.countryCodeAlpha2 || '', // 例如 CN, SG
    region: geo.regionName || 'N/A',          // 例如 Beijing, Central Singapore
    city: geo.cityName || 'N/A',              // 例如 Beijing, Singapore
    
    // 运营商信息 (ISP)
    // 腾讯云这里使用的是 'cisp' 字段
    isp: geo.cisp || 'N/A', 
    
    // ASN 信息
    asn: geo.asn ? `AS${geo.asn}` : 'N/A',
    
    // 经纬度
    latitude: geo.latitude || null,
    longitude: geo.longitude || null
  };
}

// 2. 智能判断客户端类型
function isBrowserRequest(request) {
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  const acceptHeader = (request.headers.get('Accept') || '').toLowerCase();
  
  // 明确请求 HTML
  if (acceptHeader.includes('text/html')) return true;
  
  // 常见命令行工具
  const cliTools = ['curl', 'wget', 'httpie', 'python', 'bot', 'go-http-client'];
  if (cliTools.some(tool => userAgent.includes(tool))) return false;
  
  // 浏览器
  return true;
}

// 3. 通用响应头
function makeHeaders(type) {
  return {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*', 
    'Cache-Control': 'no-store, max-age=0',
  };
}

// 4. HTML 页面模板
function responseHtml(data) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的 IP 信息 - EdgeOne</title>
  <style>
    :root { --accent: #0052d9; --bg: #f0f2f5; --card: #fff; --text: #333; }
    @media (prefers-color-scheme: dark) { :root { --accent: #4582e6; --bg: #121212; --card: #1e1e1e; --text: #e0e0e0; } }
    
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
    
    .card { background: var(--card); padding: 2rem; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); width: 100%; max-width: 460px; }
    
    h1 { font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 1rem; text-align: center;}
    
    .ip-container { text-align: center; margin-bottom: 2rem; }
    .ip { font-size: 2.2rem; font-weight: 800; color: var(--accent); cursor: pointer; transition: opacity 0.2s; word-break: break-all; line-height: 1.2; }
    .ip:active { opacity: 0.6; }
    .click-tip { font-size: 0.75rem; color: #aaa; margin-top: 0.5rem; opacity: 0.8; }
    
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .item { display: flex; flex-direction: column; }
    .item-label { font-size: 0.8rem; color: #888; margin-bottom: 0.3rem; }
    .item-value { font-weight: 600; font-size: 1rem; }
    .full-width { grid-column: 1 / -1; }
    
    .badge { display: inline-block; background: rgba(0, 82, 217, 0.1); color: var(--accent); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 5px; vertical-align: middle; }
    
    .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px); background: #333; color: white; padding: 8px 20px; border-radius: 50px; font-size: 0.9rem; opacity: 0; transition: all 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <div class="card">
    <h1>Your Public IP</h1>
    <div class="ip-container">
      <div class="ip" onclick="copyIP()">${data.ip}</div>
      <div class="click-tip">点击复制 (Click to Copy)</div>
    </div>
    
    <div class="grid">
      <div class="item">
        <span class="item-label">国家 (Country)</span>
        <span class="item-value">${data.country} <span class="badge">${data.countryCode}</span></span>
      </div>
      <div class="item">
        <span class="item-label">地区 (Region)</span>
        <span class="item-value">${data.region}</span>
      </div>
      <div class="item">
        <span class="item-label">城市 (City)</span>
        <span class="item-value">${data.city}</span>
      </div>
      <div class="item">
        <span class="item-label">ASN</span>
        <span class="item-value">${data.asn}</span>
      </div>
      <div class="item full-width">
        <span class="item-label">运营商 (ISP)</span>
        <span class="item-value">${data.isp}</span>
      </div>
    </div>
  </div>
  
  <div id="toast" class="toast">复制成功 / Copied</div>
  <script>
    function copyIP() {
      const ip = document.querySelector('.ip').innerText;
      navigator.clipboard.writeText(ip).then(() => {
        const t = document.getElementById('toast');
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
      });
    }
  </script>
</body>
</html>
  `;
  return new Response(html, { headers: makeHeaders('text/html;charset=UTF-8') });
}

// 5. 请求处理入口
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 提取数据
  const data = getEdgeOneData(request);

  // 路由分发
  switch (path) {
    case '/json':
    case '/.json':
      return new Response(JSON.stringify(data, null, 2), { 
        headers: makeHeaders('application/json;charset=UTF-8') 
      });

    case '/ip':
    case '/.ip':
      return new Response(data.ip, { 
        headers: makeHeaders('text/plain;charset=UTF-8') 
      });

    case '/txt':
    case '/.txt':
      const text = [
        `IP: ${data.ip}`,
        `Location: ${data.country} (${data.countryCode}) - ${data.region} - ${data.city}`,
        `ISP: ${data.isp}`,
        `ASN: ${data.asn}`
      ].join('\n');
      return new Response(text + '\n', { 
        headers: makeHeaders('text/plain;charset=UTF-8') 
      });
      
    case '/full':
      // full 接口返回包含所有调试信息的 JSON，方便你以后排查
      const fullData = { ...data, raw_geo: request.eo?.geo };
      return new Response(JSON.stringify(fullData, null, 2), { 
        headers: makeHeaders('application/json;charset=UTF-8') 
      });

    case '/': 
    default:
      // 浏览器看网页，curl 看纯 IP (这是业界标准行为)
      if (isBrowserRequest(request)) {
        return responseHtml(data);
      } else {
        return new Response(`${data.ip}\n`, { 
          headers: makeHeaders('text/plain;charset=UTF-8') 
        });
      }
  }
}