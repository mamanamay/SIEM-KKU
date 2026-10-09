const fs = require('fs');
let content = fs.readFileSync('src/log.service.ts', 'utf8');

const slackMethod = `
  // ─── Slack Alert Integration ──────────────────────────────────────────────
  private async sendSlackAlert(payload: any, enriched: any) {
    if (payload.severity !== 'critical' && payload.severity !== 'high') return;

    try {
      const userRepository = this.attackRepository.manager.getRepository('User');
      const adminUser: any = await userRepository.findOne({ where: { username: 'admin' } });
      if (!adminUser || !adminUser.apiConfigJson) return;

      const apiConfig = JSON.parse(adminUser.apiConfigJson);
      if (!apiConfig.slackUrl || !apiConfig.slackUrl.startsWith('http')) return;

      let alertColor = '#36a64f';
      if (payload.severity === 'critical') alertColor = '#FF0000';
      else if (payload.severity === 'high') alertColor = '#FFA500';

      const slackPayload = {
        attachments: [
          {
            color: alertColor,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '🚨 [' + payload.severity.toUpperCase() + '] ' + payload.type,
                  emoji: true
                }
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: '*Kill Chain Phase:*\\n' + (enriched.killChainPhase || 'Intrusion') },
                  { type: 'mrkdwn', text: '*Threat Score:*\\n' + (payload.threatScore || 50) + '/100' },
                  { type: 'mrkdwn', text: '*Attacker IP:*\\n' + payload.ip + ' (' + (payload.country || 'Unknown') + ')' },
                  { type: 'mrkdwn', text: '*Target IP:*\\n' + (payload.destIp || 'Unknown') }
                ]
              },
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '*Attack Details:*\\n\`' + payload.detail + '\`' }
              },
              { type: 'divider' },
              {
                type: 'context',
                elements: [
                  { type: 'mrkdwn', text: '🛠️ *Mitigation:* ' + (payload.mitigation || 'Review Logs') },
                  { type: 'mrkdwn', text: '🕒 *Time:* ' + payload.time },
                  { type: 'mrkdwn', text: '📡 *Sensor:* ' + payload.source }
                ]
              }
            ]
          }
        ]
      };

      if (enriched.aiAnalysis) {
        slackPayload.attachments[0].blocks.splice(3, 0, {
          type: 'section',
          text: { type: 'mrkdwn', text: '🤖 *AI Insight:*\\n> ' + enriched.aiAnalysis.substring(0, 500) }
        });
      }

      await axios.post(apiConfig.slackUrl, slackPayload, { timeout: 5000 });
      this.logger.log('[Slack] Sent ' + payload.severity + ' alert for ' + payload.ip);
    } catch (e: any) {
      this.logger.error('[Slack] Failed to send alert: ' + e.message);
    }
  }
`;

const insertPos = content.lastIndexOf('}');
content = content.substring(0, insertPos) + slackMethod + '\n' + content.substring(insertPos);

const callPos = content.indexOf('this.eventsGateway.broadcastAttack(enriched);');
if (callPos > -1 && content.indexOf('this.sendSlackAlert') === -1) {
  content = content.substring(0, callPos) + 'this.sendSlackAlert(payload, enriched);\n      ' + content.substring(callPos);
}

fs.writeFileSync('src/log.service.ts', content);
console.log('Successfully patched log.service.ts');
