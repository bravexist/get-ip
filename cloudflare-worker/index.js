/**
 * Cloudflare Worker - IP & Geo Service
 * 单文件，ES Module 语法，可直接粘贴到 Cloudflare Dashboard 或用 wrangler 部署
 *
 * 路由：
 *   /            浏览器 -> HTML 页面；curl 等命令行工具 -> 纯 IP
 *   /ip          纯文本 IP
 *   /txt         多行纯文本
 *   /json        JSON
 *   /full        JSON + request.cf 原始数据（调试用）
 *
 * 数据来源：
 *   IP        -> CF-Connecting-IP 请求头
 *   地理/ASN  -> request.cf（Cloudflare 自动注入）
 *   国家名称  -> 由国家代码经 Intl.DisplayNames 生成（request.cf 只提供代码）
 */

export default {
  async fetch(request) {
    return handleRequest(request);
  },
};

/* ---------------- 1. 数据提取 ---------------- */

const displayNamesCache = {};

function countryName(code, lang) {
  if (!code) return 'N/A';
  if (code === 'T1') return lang === 'en' ? 'Tor Network' : 'Tor 网络';
  if (code === 'XX') return lang === 'en' ? 'Unknown' : '未知';
  try {
    displayNamesCache[lang] ||= new Intl.DisplayNames([lang], { type: 'region' });
    return displayNamesCache[lang].of(code) || code;
  } catch {
    return code;
  }
}

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getClientData(request) {
  const cf = request.cf || {};
  const headers = request.headers;

  const ip =
    headers.get('CF-Connecting-IP') ||
    (headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    'Unknown';

  const code = String(cf.country || '').toUpperCase();

  return {
    ip,
    ipVersion: ip.includes(':') ? 'IPv6' : ip.includes('.') ? 'IPv4' : 'Unknown',

    country: countryName(code, 'en'),
    countryZh: countryName(code, 'zh-CN'),
    countryCode: code,
    region: cf.region || 'N/A',
    regionCode: cf.regionCode || '',
    city: cf.city || 'N/A',
    timezone: cf.timezone || 'N/A',

    // Cloudflare 提供的是 ASN 所属组织名，等价于大多数场景下的 ISP
    isp: cf.asOrganization || 'N/A',
    asn: cf.asn ? `AS${cf.asn}` : 'N/A',

    latitude: toNumber(cf.latitude),
    longitude: toNumber(cf.longitude),

    // 本次请求命中的 Cloudflare 边缘节点（机场三字码）
    colo: cf.colo || 'N/A',
  };
}

/* ---------------- 2. 客户端类型判断 ---------------- */

function isBrowserRequest(request) {
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();
  const accept = (request.headers.get('Accept') || '').toLowerCase();

  if (accept.includes('text/html')) return true;

  const cliTools = ['curl', 'wget', 'httpie', 'python', 'bot', 'go-http-client'];
  if (cliTools.some((t) => ua.includes(t))) return false;

  return true;
}

/* ---------------- 3. 通用响应头 ---------------- */

function makeHeaders(type) {
  return {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, max-age=0',
  };
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- 4. HTML 页面 ---------------- */

function responseHtml(data) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的 IP 信息</title>
  <style>
    :root { --accent: #f6821f; --bg: #f0f2f5; --card: #fff; --text: #333; --muted: #888; }
    @media (prefers-color-scheme: dark) { :root { --accent: #fb923c; --bg: #121212; --card: #1e1e1e; --text: #e0e0e0; } }

    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }

    .card { background: var(--card); padding: 2rem; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); width: 100%; max-width: 460px; }

    h1 { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 1rem; text-align: center; font-weight: 600; }

    .ip-container { text-align: center; margin-bottom: 2rem; }
    .ip { font-size: 2.2rem; font-weight: 800; color: var(--accent); cursor: pointer; transition: opacity 0.2s; word-break: break-all; line-height: 1.2; }
    .ip:active { opacity: 0.6; }
    .click-tip { font-size: 0.75rem; color: #aaa; margin-top: 0.5rem; opacity: 0.8; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .item { display: flex; flex-direction: column; min-width: 0; }
    .item-label { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.3rem; }
    .item-value { font-weight: 600; font-size: 1rem; word-break: break-word; }
    .full-width { grid-column: 1 / -1; }

    .badge { display: inline-block; background: rgba(246, 130, 31, 0.12); color: var(--accent); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 5px; vertical-align: middle; }

    .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px); background: #333; color: white; padding: 8px 20px; border-radius: 50px; font-size: 0.9rem; opacity: 0; transition: all 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <div class="card">
    <h1>Your Public IP</h1>
    <div class="ip-container">
      <div class="ip" id="ip" onclick="copyIP()">${esc(data.ip)}</div>
      <div class="click-tip">点击复制 (Click to Copy) · ${esc(data.ipVersion)}</div>
    </div>

    <div class="grid">
      <div class="item">
        <span class="item-label">国家 (Country)</span>
        <span class="item-value">${esc(data.countryZh)}${data.countryCode ? ` <span class="badge">${esc(data.countryCode)}</span>` : ''}</span>
      </div>
      <div class="item">
        <span class="item-label">地区 (Region)</span>
        <span class="item-value">${esc(data.region)}</span>
      </div>
      <div class="item">
        <span class="item-label">城市 (City)</span>
        <span class="item-value">${esc(data.city)}</span>
      </div>
      <div class="item">
        <span class="item-label">时区 (Timezone)</span>
        <span class="item-value">${esc(data.timezone)}</span>
      </div>
      <div class="item">
        <span class="item-label">ASN</span>
        <span class="item-value">${esc(data.asn)}</span>
      </div>
      <div class="item">
        <span class="item-label">边缘节点 (Colo)</span>
        <span class="item-value">${esc(data.colo)}</span>
      </div>
      <div class="item full-width">
        <span class="item-label">运营商 (ISP)</span>
        <span class="item-value">${esc(data.isp)}</span>
      </div>
    </div>
  </div>

  <div id="toast" class="toast">复制成功 / Copied</div>
  <script>
    function showToast() {
      var t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(function () { t.classList.remove('show'); }, 2000);
    }
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast(); } catch (e) {}
      document.body.removeChild(ta);
    }
    function copyIP() {
      var ip = document.getElementById('ip').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ip).then(showToast, function () { fallbackCopy(ip); });
      } else {
        fallbackCopy(ip);
      }
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: makeHeaders('text/html;charset=UTF-8') });
}

/* ---------------- 5. 请求入口 ---------------- */

async function handleRequest(request) {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);
  // 去掉末尾斜杠（根路径除外）
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';

  const data = getClientData(request);

  switch (path) {
    case '/json':
    case '/.json':
      return new Response(JSON.stringify(data, null, 2), {
        headers: makeHeaders('application/json;charset=UTF-8'),
      });

    case '/ip':
    case '/.ip':
      return new Response(data.ip, {
        headers: makeHeaders('text/plain;charset=UTF-8'),
      });

    case '/txt':
    case '/.txt': {
      const text = [
        `IP: ${data.ip}`,
        `Location: ${data.country} (${data.countryCode}) - ${data.region} - ${data.city}`,
        `ISP: ${data.isp}`,
        `ASN: ${data.asn}`,
        `Timezone: ${data.timezone}`,
        `Colo: ${data.colo}`,
      ].join('\n');
      return new Response(text + '\n', {
        headers: makeHeaders('text/plain;charset=UTF-8'),
      });
    }

    case '/full': {
      // 默认只附带与地理/网络归属相关的 request.cf 字段；
      // 需要完整原始对象（含 TLS 等连接元数据）时访问 /full?all=1
      const cf = request.cf || {};
      const geoKeys = [
        'asn', 'asOrganization',
        'country', 'continent', 'isEUCountry',
        'region', 'regionCode', 'city', 'postalCode', 'metroCode',
        'timezone', 'latitude', 'longitude',
        'colo',
      ];
      const raw_cf =
        url.searchParams.get('all') === '1'
          ? cf
          : Object.fromEntries(
              geoKeys.filter((k) => cf[k] !== undefined).map((k) => [k, cf[k]])
            );
      return new Response(JSON.stringify({ ...data, raw_cf }, null, 2), {
        headers: makeHeaders('application/json;charset=UTF-8'),
      });
    }

    case '/':
    default:
      // 浏览器看网页，curl 看纯 IP
      if (isBrowserRequest(request)) {
        return responseHtml(data);
      }
      return new Response(`${data.ip}\n`, {
        headers: makeHeaders('text/plain;charset=UTF-8'),
      });
  }
}