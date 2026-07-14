import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import https from 'https';

export const GET: RequestHandler = async ({ request }) => {
    // Check Authorization (ตรวจสอบสิทธิ์จาก Frontend ของเราเอง)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // อ่าน URL และ Key ที่ส่งมาจาก Frontend (ซึ่งถูกตั้งค่าไว้ที่หน้า Settings)
    const externalUrl = request.headers.get('x-scorecard-url');
    const externalKey = request.headers.get('x-scorecard-key') || '';

    if (!externalUrl) {
        return json({ error: 'Scorecard API URL not configured. Please configure it in Settings.' }, { status: 400 });
    }

    return new Promise((resolve) => {
        // ใช้ https.get เพื่อตั้งค่า rejectUnauthorized: false (ข้ามการเช็ค SSL Certificate)
        const req = https.get(externalUrl, {
            rejectUnauthorized: false, 
            headers: {
                // ส่ง API Key กลับไปยังระบบ Scorecard จริง
                ...(externalKey ? { 'Authorization': `Bearer ${externalKey}` } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(json(jsonData));
                } catch (e) {
                    console.error('Invalid JSON from Scorecard API:', data);
                    resolve(json({ error: 'Invalid JSON', raw: data }, { status: 500 }));
                }
            });
        });

        req.on('error', (e) => {
            console.error('Proxy Scorecard Error:', e);
            resolve(json({ error: 'Failed to fetch from external API', details: e.message }, { status: 500 }));
        });
    });
};
