import xml.etree.ElementTree as ET
import re

with open("frontend/src/lib/components/WorldMap.svelte", "r", encoding="utf-8") as f:
    data = f.read()

# the file starts with our inserted <svg>, let's strip it to get the raw wikipedia SVG
data = data.replace("<svg viewBox=\"0 0 1000 500\" xmlns=\"http://www.w3.org/2000/svg\">\n", "")

# Extract all paths
paths = re.findall(r'<path[^>]*d="([^"]+)"[^>]*>', data)

# Build a clean Svelte component
out = []
out.append("<script>\n  export let stroke = '#334155';\n  export let fill = '#0f172a';\n  export let strokeWidth = '0.5';\n</script>")
out.append("<svg viewBox=\"0 0 950 620\" width=\"100%\" height=\"100%\" xmlns=\"http://www.w3.org/2000/svg\">")
out.append("  <g style=\"fill: {fill}; stroke: {stroke}; stroke-width: {strokeWidth}; stroke-linejoin: round;\">")
for d in paths:
    out.append(f'    <path d="{d}" />')
out.append("  </g>")
out.append("</svg>")

with open("frontend/src/lib/components/WorldMap.svelte", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
    
print(f"Cleaned SVG with {len(paths)} paths.")