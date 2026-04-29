
const https = require('https');

async function testConnection(url) {
    console.log(`Testing connection to: ${url}`);
    const parsedUrl = new URL(url);

    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: '/system_stats',
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'http://localhost:5173',
            'Host': parsedUrl.hostname,
            'Referer': url + '/'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            console.log(`Status Code: ${res.statusCode}`);
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log('Successfully connected and parsed system_stats!');
                    console.log('ComfyUI Version:', json.system?.comfyui_version);
                    resolve(true);
                } catch (e) {
                    console.log('Failed to parse JSON response');
                    console.log('Response body snippet:', data.substring(0, 200));
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Request Error:', err.message);
            resolve(false);
        });

        req.end();
    });
}

testConnection('https://pro5091.proai123.com');
