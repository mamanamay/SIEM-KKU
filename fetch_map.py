import urllib.request
url = "https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req).read().decode('utf-8')
    with open("frontend/src/lib/components/WorldMap.svelte", "w", encoding="utf-8") as f:
        f.write("<svg viewBox=\"0 0 1000 500\" xmlns=\"http://www.w3.org/2000/svg\">\n")
        f.write(response) # this won't be clean, but let's see
    print("Saved Wikimedia map")
except Exception as e:
    print(f"Error: {e}")