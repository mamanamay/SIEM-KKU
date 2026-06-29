export const faculties = [
  { code: 'AG', name: 'คณะเกษตรศาสตร์' },
  { code: 'AMS', name: 'คณะเทคนิคการแพทย์' },
  { code: 'ARCH', name: 'คณะสถาปัตยกรรมศาสตร์' },
  { code: 'ART', name: 'คณะศิลปกรรมศาสตร์' },
  { code: 'COLA', name: 'วิทยาลัยการปกครองท้องถิ่น' },
  { code: 'CP', name: 'วิทยาลัยการคอมพิวเตอร์' },
  { code: 'DENT', name: 'คณะทันตแพทยศาสตร์' },
  { code: 'ECON', name: 'คณะเศรษฐศาสตร์' },
  { code: 'EDU', name: 'คณะศึกษาศาสตร์' },
  { code: 'EN', name: 'คณะวิศวกรรมศาสตร์' },
  { code: 'GS', name: 'บัณฑิตวิทยาลัย' },
  { code: 'HUSO', name: 'คณะมนุษยศาสตร์และสังคมศาสตร์' },
  { code: 'IC', name: 'วิทยาลัยนานาชาติ' },
  { code: 'LAW', name: 'คณะนิติศาสตร์' },
  { code: 'MBA', name: 'วิทยาลัยบัณฑิตศึกษาการจัดการ' },
  { code: 'MED', name: 'คณะแพทยศาสตร์' },
  { code: 'MS/KKBS', name: 'คณะบริหารธุรกิจและการบัญชี' },
  { code: 'NKC', name: 'คณะสหวิทยาการ' },
  { code: 'NU', name: 'คณะพยาบาลศาสตร์' },
  { code: 'PH', name: 'คณะสาธารณสุขศาสตร์' },
  { code: 'Px', name: 'คณะเภสัชศาสตร์' },
  { code: 'SC', name: 'คณะวิทยาศาสตร์' },
  { code: 'TE', name: 'คณะเทคโนโลยี' },
  { code: 'VET', name: 'คณะสัตวแพทยศาสตร์' }
];

// Helper to determine if an IP is "internal" (mock logic for demo)
// In a real system, this would check if IP matches KKU's subnet e.g. 10.x.x.x or 192.168.x.x
export function isInternalIP(ip: string): boolean {
  if (!ip) return false;
  return ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip === '127.0.0.1' || ip === '::1';
}

// Simple deterministic hash to map an IP to a faculty (DISABLED AS REQUESTED: "เว้นว่างไว้ก่อน")
export function getFacultyForIP(ip: string) {
  // if (!isInternalIP(ip)) return null;
  // let hash = 0;
  // for (let i = 0; i < ip.length; i++) {
  //   hash = ip.charCodeAt(i) + ((hash << 5) - hash);
  // }
  // const index = Math.abs(hash) % faculties.length;
  // return faculties[index];
  
  return null; // Return null so the Faculty column is left blank for now
}
