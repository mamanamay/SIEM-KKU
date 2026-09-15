import urllib.request
import re
import xml.etree.ElementTree as ET

url = "https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
response = urllib.request.urlopen(req).read().decode('utf-8')

# The SVG paths usually have id="th" or id="THA"
th_match = re.search(r'<path[^>]*id="(?i:th|tha|thailand)"[^>]*d="([^"]+)"', response)
if th_match:
    d = th_match.group(1)
    # Extract all coordinates
    coords = [float(x) for x in re.findall(r'-?\d+\.\d+|-?\d+', d)]
    # Since it's SVG path, first instruction is usually M x,y
    print("Found Thailand Path!")
    
    # Very rough bounding box:
    # coordinates in path are often absolute or relative. 
    # Let's just find all absolute coordinates (rough approx if some are relative, but usually Wikipedia maps use absolute)
    # Actually, Wikipedia maps use a mix of commands. Let's just use a known coordinate for Thailand on standard maps.
    print(d[:100])
else:
    print("Not found by ID.")
    # Let's just parse the viewBox and guess based on standard mercator/equirectangular