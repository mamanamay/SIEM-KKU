import os

filepath = 'frontend/src/routes/dashboard/cve/+page.svelte'
with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Replace the alert block
old_block = """    if (!apiKey) {
      alert("???????????? KKU AI API Key ?????????????????????? (Settings) ??????????");
      return;
    }"""
new_block = """    let searchMode = 'standard';
    if (!apiKey && searchMode === 'ai') {
      alert("Please configure KKU AI API Key in Settings for AI Analysis Mode.");
      return;
    }"""
content = content.replace(old_block, new_block)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed CVE page alert")