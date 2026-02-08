#!/usr/bin/env node
// CRC Verification Tool for DJI DUML Messages
// Usage: node tools/verify-crc.mjs <hex-string>
// Example: node tools/verify-crc.mjs 552204ea020780924007450f30303137343933313932383631303204353136302e42

import { CRC } from 'crc-full';

const hex = process.argv[2];
if (!hex) {
  console.error('Usage: node verify-crc.mjs <hex-message>');
  console.error('Example: node verify-crc.mjs 552204ea020780924007450f30303137343933313932383631303204353136302e42');
  process.exit(1);
}

const buf = Buffer.from(hex, 'hex');

if (buf[0] !== 0x55) {
  console.error(`❌ Invalid magic byte: 0x${buf[0].toString(16)} (expected 0x55)`);
  process.exit(1);
}

console.log('=== DUML Message Analysis ===\n');
console.log(`Raw hex: ${hex}`);
console.log(`Length: ${buf.length} bytes\n`);

// Parse header
const declaredLen = buf[1] | ((buf[2] & 0x03) << 8);
const version = buf[2] >> 2;
const crc8Stored = buf[3];

console.log('--- Header ---');
console.log(`Magic: 0x${buf[0].toString(16)}`);
console.log(`Declared length: ${declaredLen} (actual: ${buf.length})`);
console.log(`Version: ${version}`);

// Verify CRC8
const crc8Calc = new CRC('CRC8', 8, 0x31, 0xEE, 0x00, true, true);
const crc8Computed = crc8Calc.compute(buf.slice(0, 3));
const crc8Match = crc8Computed === crc8Stored;
console.log(`CRC8: stored=0x${crc8Stored.toString(16)}, computed=0x${crc8Computed.toString(16)} ${crc8Match ? '✅' : '❌'}`);

// Parse target
const sender = buf[4];
const receiver = buf[5];
const target = buf[4] | (buf[5] << 8);
console.log(`\n--- Target ---`);
console.log(`Wire bytes: ${buf.slice(4, 6).toString('hex')} (LE)`);
console.log(`Sender: 0x${sender.toString(16)}, Receiver: 0x${receiver.toString(16)}`);
console.log(`Target value: 0x${target.toString(16)} (${target})`);

// Parse message ID
const msgId = buf.readUInt16BE(6);
console.log(`\n--- Message ID ---`);
console.log(`Wire bytes: ${buf.slice(6, 8).toString('hex')} (BE)`);
console.log(`Value: 0x${msgId.toString(16)} (${msgId})`);

// Parse type
const flags = buf[8];
const cmdSet = buf[9];
const cmdId = buf[10];
const typeLE = buf[8] | (buf[9] << 8) | (buf[10] << 16);
const typeBE = (buf[8] << 16) | (buf[9] << 8) | buf[10];
console.log(`\n--- Type ---`);
console.log(`Wire bytes: ${buf.slice(8, 11).toString('hex')}`);
console.log(`Flags: 0x${flags.toString(16)} (${flags & 0x80 ? 'response' : flags & 0x40 ? 'request' : 'notification'})`);
console.log(`CmdSet: 0x${cmdSet.toString(16)}`);
console.log(`CmdId: 0x${cmdId.toString(16)}`);
console.log(`Type (LE uint24): 0x${typeLE.toString(16)}`);
console.log(`Type (BE uint24): 0x${typeBE.toString(16)}`);

// Parse payload
const payload = buf.slice(11, buf.length - 2);
console.log(`\n--- Payload ---`);
console.log(`Length: ${payload.length} bytes`);
console.log(`Hex: ${payload.toString('hex')}`);
if (payload.length <= 20) {
  console.log(`Decimal: [${Array.from(payload).join(', ')}]`);
}

// Try to decode PackString payload (for pairing/wifi messages)
if (cmdSet === 0x07 && (cmdId === 0x45 || cmdId === 0x47) && payload.length > 2) {
  console.log('\n--- PackString Decode ---');
  let off = 0;
  let strNum = 1;
  while (off < payload.length) {
    const len = payload[off];
    if (off + 1 + len > payload.length) break;
    const str = payload.slice(off + 1, off + 1 + len).toString('utf8');
    console.log(`String ${strNum}: "${str}" (${len} bytes)`);
    off += 1 + len;
    strNum++;
  }
}

// Verify CRC16
const crc16Stored = buf.readUInt16LE(buf.length - 2);
const crc16Calc = new CRC('CRC16', 16, 0x1021, 0x496C, 0x0000, true, true);
const crc16Computed = crc16Calc.compute(buf.slice(0, buf.length - 2));
const crc16Match = crc16Computed === crc16Stored;
console.log(`\n--- CRC16 ---`);
console.log(`Wire bytes: ${buf.slice(buf.length - 2).toString('hex')} (LE)`);
console.log(`Stored: 0x${crc16Stored.toString(16)}, Computed: 0x${crc16Computed.toString(16)} ${crc16Match ? '✅' : '❌'}`);

console.log(`\n=== Overall: ${crc8Match && crc16Match ? '✅ VALID' : '❌ INVALID'} ===`);
if (declaredLen !== buf.length) {
  console.log(`⚠️  Length mismatch: declared=${declaredLen}, actual=${buf.length}`);
}
