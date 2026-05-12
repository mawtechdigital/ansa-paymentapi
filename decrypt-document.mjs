// decrypt-document.mjs
// Usage: node decrypt-document.mjs
//
// Prompts you for the encrypted value from DB and your secret key,
// then shows the decrypted document number.

import * as crypto from 'crypto';
import * as readline from 'readline';

const ALGORITHM = 'aes-256-cbc';

function decrypt(encryptedText, secretKey) {
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((r) => rl.question(q, r));

async function main() {
  console.log('=== Document Number Decryptor ===\n');

  const encryptedValue = await ask('Paste encrypted value (iv:data format): ');
  const secretKey = await ask('Enter ENCRYPTION_SECRET_KEY from .env: ');

  try {
    const decrypted = decrypt(encryptedValue.trim(), secretKey.trim());
    console.log(`\n✅ Decrypted value: ${decrypted}`);
  } catch (error) {
    console.log(`\n❌ Decryption failed: ${error.message}`);
    console.log('   Check that encrypted value and secret key are correct.');
  }

  rl.close();
}

main();
