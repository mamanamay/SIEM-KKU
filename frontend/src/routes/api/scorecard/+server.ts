import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    // Check Authorization
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SIMULATED EXTERNAL API FETCH
    // ในระบบจริง คุณจะใช้ fetch() ไปยัง API ของ Scorecard องค์กร
    // const res = await fetch('https://scorecard.kku.ac.th/api/v1/overall', { ... })
    // const data = await res.json()
    
    const mockData = {
        organization: "Khon Kaen University",
        lastUpdated: new Date().toISOString(),
        score: 92,
        maxScore: 100,
        status: "Secure",
        breakdown: {
            network: 95,
            endpoint: 88,
            application: 92,
            cloud: 94
        },
        recommendations: [
            "Patch 12 unpatched Windows Server vulnerabilities",
            "Review SSH access logs for anomalous logins"
        ]
    };

    return json(mockData);
};
