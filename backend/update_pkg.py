import json

with open('package.json', 'r') as f:
    data = json.load(f)

data['dependencies']['axios'] = '^1.7.2'
data['dependencies']['puppeteer'] = '^22.12.1'

with open('package.json', 'w') as f:
    json.dump(data, f, indent=2)

print("Added axios and puppeteer to package.json")