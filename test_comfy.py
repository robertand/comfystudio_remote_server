import requests
import sys

url = "https://pro5091.proai123.com/system_stats"
headers = {
    "Origin": "https://pro5091.proai123.com",
    "Host": "pro5091.proai123.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    response = requests.get(url, headers=headers, timeout=10)
    print(f"Status: {response.status_code}")
    print(f"Content: {response.text[:100]}")
except Exception as e:
    print(f"Error: {e}")
