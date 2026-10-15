'use strict';
const fs = require('node:fs');
const { X509Certificate } = require('node:crypto');

function checkExtraCa(path) {
  if (!path) return 0;
  const pem = fs.readFileSync(path, 'utf8');
  if (/-----BEGIN .*PRIVATE KEY-----/.test(pem)) throw new Error('Use public CA certificates only; remove the private key');
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  if (!certificates.length) throw new Error('No PEM certificates found');
  for (const block of certificates) {
    const certificate = new X509Certificate(block);
    if (!certificate.ca) throw new Error('The bundle contains a server/client certificate instead of a CA certificate');
    const now = Date.now();
    if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo))
      throw new Error('The bundle contains a CA certificate outside its validity period');
  }
  return certificates.length;
}

module.exports = { checkExtraCa };
if (require.main === module) {
  try {
    const count = checkExtraCa(process.env.NODE_EXTRA_CA_CERTS);
    if (count) console.log('Additional outbound CA bundle validated: ' + count + ' CA certificate(s)');
  } catch (error) {
    console.error('Additional outbound CA configuration invalid: ' + (error.code || error.message));
    process.exitCode = 1;
  }
}
