async function test() {
  const url = "https://pro5091.proai123.com/system_stats";
  const headers = {
      "Origin": "https://pro5091.proai123.com",
      "Host": "pro5091.proai123.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  try {
      const response = await fetch(url, { headers, method: 'GET' });
      console.log(`Status: ${response.status}`);
      const text = await response.text();
      console.log(`Content: ${text.slice(0, 100)}`);
  } catch (e) {
      console.log(`Error: ${e.message}`);
  }
}

test();
