
const fs = require('fs');
let content = fs.readFileSync('src/attacks.controller.ts', 'utf-8');

// 1. Add ID query
content = content.replace(
  @Query('q') q?: string,\n    @Query('severity') severity?: string,,
  @Query('q') q?: string,\n    @Query('id') id?: string,\n    @Query('severity') severity?: string,
);

content = content.replace(
  if (q && q.trim()) {\n      qb.andWhere(,
  if (id && id.trim()) {\n      qb.andWhere('a.id = :id', { id: id.trim() });\n    } else if (q && q.trim()) {\n      qb.andWhere(
);

// 2. Replace generateRuleBasedAnalysis
const startStr = 'const generateRuleBasedAnalysis = () => {';
const endStr = 'return { analysis, mode: \'rule-based\' };\n    };';

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr) + endStr.length;

if (startIdx === -1 || endIdx === -1) {
  console.log('Cannot find block', startIdx, endIdx);
  process.exit(1);
}

const newFunc = \const generateRuleBasedAnalysis = () => {
      const rawStr = JSON.stringify(fullRawLog).toLowerCase();
      
      let what = \\\การโจมตีประเภท \\\\;
      let how = 'ระบบตรวจพบความผิดปกติจากรูปแบบพฤติกรรม (Rule-based signature)';
      let recommendation = 'บล็อก IP ต้นทางที่ Firewall และตรวจสอบช่องโหว่ที่เกี่ยวข้อง';
      let impact = event.mitreCode ? \\\พบความเชื่อมโยงกับ MITRE ATT&CK: \\\\ : 'อาจก่อให้เกิดความเสี่ยงต่อระบบภายในหากปล่อยทิ้งไว้';
      
      if (/select|drop|union|or 1=1|--|insert|update|delete from/i.test(rawStr)) {
        what = 'ความพยายามโจมตีด้วย SQL Injection';
        how = 'ตรวจพบ Payload ที่มีคำสั่ง SQL แทรกซึมเข้ามาเพื่อดึงหรือลบข้อมูลในฐานข้อมูล';
        recommendation = 'ตรวจสอบ Input Validation ที่ Web Application และบล็อก IP';
      } else if (/<script>|javascript:|alert\\\\(|onerror=/i.test(rawStr)) {
        what = 'ความพยายามโจมตีด้วย Cross-Site Scripting (XSS)';
        how = 'ตรวจพบ Script อันตรายถูกแนบมากับ Request หวังให้ทำงานบนเบราว์เซอร์ของเหยื่อ';
        recommendation = 'ตั้งค่า WAF ให้กรอง HTML/JS Tags และทำ Data Sanitization ก่อนบันทึก';
      } else if (/brute|ssh.*login|login.*fail|authentication.*fail/i.test(rawStr)) {
        what = 'ความพยายามสุ่มรหัสผ่าน (Brute Force)';
        how = 'ตรวจพบการพยายามล็อกอินล้มเหลวหลายครั้งติดต่อกันในเวลาสั้นๆ';
        recommendation = 'เปิดใช้งาน 2FA และตั้งค่า Account Lockout Policy (ระงับบัญชีชั่วคราวหลังใส่รหัสผิด)';
      } else if (/rm |rm -rf|wget |curl |chmod|exec|cmd:/i.test(rawStr)) {
        what = 'การสั่งรันคำสั่งอันตราย (Command Execution / RCE)';
        how = 'ตรวจพบการส่งคำสั่งระดับ OS เข้ามาทำงานในระบบโดยไม่ได้รับอนุญาต';
        recommendation = 'ตรวจสอบ Process ที่น่าสงสัยบนเครื่องเป้าหมาย และ Isolate เครื่องออกจากเครือข่ายทันที';
      }

      let resultStatus = event.status || 'ระบบได้บันทึกและแจ้งเตือนแล้ว';
      if (/success|login.*ok|session.*open|http 200|200 ok/i.test(rawStr)) {
        resultStatus = 'การโจมตีสำเร็จ (Succeed) - คนร้ายอาจเข้าถึงระบบได้แล้ว';
      } else if (/fail|block|403|401|reject|denied/i.test(rawStr)) {
        resultStatus = 'การโจมตีล้มเหลว (Failed) - ระบบป้องกันไว้ได้';
      }

      const fallbackJson = {
        summary: \\\พบพฤติกรรม \ จาก IP \ พุ่งเป้าไปที่ \ (ประเมินโดย Rule-based SIEM)\\\,
        who: \\\IP \ (\)\\\,
        what: what,
        where: \\\ระบบเป้าหมาย IP \\\\,
        when: event.timeStr || event.time || event.createdAt || 'ช่วงเวลาที่เกิดเหตุ',
        how: how,
        result: resultStatus,
        impact: impact,
        recommendation: recommendation,
        storyline: \\\**ระบบ SIEM (Rule-based Engine) ตรวจพบความผิดปกติ**\\\\n- **ลักษณะเหตุการณ์:** \\\\\n- **ผลลัพธ์:** \\\\\n\\\\n*หมายเหตุ: ข้อมูลนี้ถูกสร้างขึ้นโดย Rule-based Fallback เนื่องจากไม่สามารถเชื่อมต่อกับ AI API ได้ในขณะนี้ แนะนำให้ผู้ดูแลระบบตรวจสอบ Payload เชิงลึกด้วยตนเองอีกครั้ง*\\\,
        confidence_percentage: 70
      };

      return { analysis: JSON.stringify(fallbackJson), mode: 'rule-based' };
    };\;

content = content.slice(0, startIdx) + newFunc + content.slice(endIdx);
fs.writeFileSync('src/attacks.controller.ts', content, 'utf-8');
console.log('Success');

