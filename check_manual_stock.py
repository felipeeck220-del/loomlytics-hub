import os
import requests
import json

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

def check():
    # 1. Get a company_id from any article or client
    r = requests.get(f"{url}/rest/v1/articles?select=company_id&limit=1", headers=headers)
    if r.status_code != 200 or not r.json():
        print("No articles found or error fetching articles")
        return
    
    company_id = r.json()[0]['company_id']
    print(f"Testing with company_id: {company_id}")

    # 2. Check if manual_stock_movements has any data for this company
    r = requests.get(f"{url}/rest/v1/manual_stock_movements?company_id=eq.{company_id}&select=count", headers=headers)
    print(f"Manual stock movements count: {r.text}")

    # 3. Try calling the RPC
    rpc_url = f"{url}/rest/v1/rpc/get_manual_stock_estoque"
    payload = {
        "p_company_id": company_id,
        "p_month": "all"
    }
    r_rpc = requests.post(rpc_url, headers=headers, json=payload)
    print(f"RPC Status: {r_rpc.status_code}")
    if r_rpc.status_code == 200:
        data = r_rpc.json()
        kpis = data.get('kpis', {})
        print("KPIs:", json.dumps(kpis, indent=2))
        groups = data.get('groups', [])
        print(f"Groups count: {len(groups)}")
        if kpis.get('stockRolls', 0) == 0 and kpis.get('stockKg', 0) == 0:
            print("WARNING: Stock is zero in RPC response")
            # 4. Investigate raw movements if stock is zero
            r_movs = requests.get(f"{url}/rest/v1/manual_stock_movements?company_id=eq.{company_id}&limit=5", headers=headers)
            print("Sample movements:", r_movs.json())
    else:
        print(f"RPC Error: {r_rpc.text}")

if __name__ == "__main__":
    check()
