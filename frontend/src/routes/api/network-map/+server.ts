import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

// Construct the absolute path to the JSON file
const dataFilePath = path.resolve('src/lib/data/ip_records.json');

export async function GET() {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf-8');
    return json(JSON.parse(data));
  } catch (error) {
    return json({ error: 'Failed to read data' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const newRecords = await request.json();
    
    // Write back to the JSON file
    fs.writeFileSync(dataFilePath, JSON.stringify(newRecords, null, 2), 'utf-8');
    
    return json({ success: true });
  } catch (error) {
    return json({ error: 'Failed to write data' }, { status: 500 });
  }
}
