import http from 'http';

const match = '/comfy-proxy/https/pro5091.proai123.com/443/system_stats'.match(/^\/comfy-proxy\/([^/]+)\/([^/]+)\/([^/]+)/);
console.log('Match:', match);
if (match) {
  const [_, protocol, host, port] = match;
  const p = Number(port);
  const isStandard = (protocol === 'http' && p === 80) || (protocol === 'https' && p === 443);
  const target = `${protocol}://${host}${isStandard ? '' : `:${port}`}`;
  console.log('Resolved Target:', target);
}
