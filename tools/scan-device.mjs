#!/usr/bin/env node
// BLE Scanner for DJI Devices
// Usage: node tools/scan-device.mjs [timeout_seconds]

import noble from '@stoprocent/noble';

const timeout = parseInt(process.argv[2] || '15') * 1000;
const found = new Map();

noble.on('stateChange', (state) => {
  console.log(`BLE adapter state: ${state}`);
  if (state === 'poweredOn') {
    console.log(`Scanning for DJI devices (${timeout/1000}s timeout)...\n`);
    noble.startScanningAsync([], true);
  }
});

noble.on('discover', (peripheral) => {
  const name = peripheral.advertisement?.localName || '';
  if (name.includes('Osmo') || name.includes('DJI') || name.includes('Pocket') || name.includes('Action')) {
    if (!found.has(peripheral.id)) {
      found.set(peripheral.id, { name, rssi: peripheral.rssi });
      const mfr = peripheral.advertisement?.manufacturerData;
      console.log(`✅ Found: ${name}`);
      console.log(`   ID: ${peripheral.id}`);
      console.log(`   RSSI: ${peripheral.rssi} dBm`);
      console.log(`   Manufacturer Data: ${mfr ? mfr.toString('hex') : 'none'}`);
      console.log(`   Service UUIDs: ${JSON.stringify(peripheral.advertisement?.serviceUuids || [])}`);
      console.log();
    }
  }
});

setTimeout(() => {
  noble.stopScanning();
  if (found.size === 0) {
    console.log('No DJI devices found.');
    console.log('\nTroubleshooting:');
    console.log('  1. Make sure the camera is turned on');
    console.log('  2. Check camera Bluetooth is enabled (Settings → Connection → Bluetooth)');
    console.log('  3. If camera was recently disconnected uncleanly, restart it');
    console.log('  4. Reset Mac Bluetooth: blueutil --power 0 && sleep 2 && blueutil --power 1');
  } else {
    console.log(`Found ${found.size} DJI device(s).`);
    console.log('\nTo connect:');
    for (const [id, info] of found) {
      console.log(`  node examples/connect-to-device.js ${id} 3 <wifi-ssid> <wifi-pass> <rtmp-url>`);
    }
  }
  process.exit(0);
}, timeout);
