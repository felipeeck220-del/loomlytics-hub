import os
import requests
import json

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")

if not url or not key:
    print("Missing environment variables")
    exit(1)

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# We need a company_id. Let's try to find one from profiles.
# Actually, the user says it's "zerado", so they are likely logged in.
# I will try to call it with a dummy UUID to see if it returns the "forbidden" or empty structure.
# But better to find a real company_id.
# I'll query profiles table via postgrest.
profiles_url = f"{url}/rest/v1/profiles?select=company_id&limit=1"
r = requests.get(profiles_url, headers=headers)
if r.status_code == 200 and r.json():
    company_id = r.json()[0]['company_id']
    print(f"Found company_id: {company_id}")
    
    rpc_url = f"{url}/rest/v1/rpc/get_manual_stock_estoque"
    payload = {
        "p_company_id": company_id,
        "p_month": "all"
    }
    r_rpc = requests.post(rpc_url, headers=headers, json=payload)
    print(f"RPC Status: {r_rpc.status_code}")
    if r_rpc.status_code == 200:
        data = r_rpc.json()
        print("KPIs:", json.dumps(data.get('kpis'), indent=2))
        groups = data.get('groups', [])
        print(f"Number of client groups: {len(groups)}")
        if groups:
            print("First group client:", groups[0].get('clientName'))
    else:
        print("RPC Error:", r_rpc.text)
else:
    print("Could not find company_id or profiles table empty/inaccessible")

