#!/usr/bin/env node
// BLE Characteristic Inspector for DJI Devices
// Usage: node tools/check-characteristics.mjs <device-id>
// Connects to a DJI device and dumps all services and characteristic properties.

import noble from '@stoprocent/noble';

const deviceId = process.argv[2];
if (!deviceId) {
  console.error('Usage: node check-characteristics.mjs <device-id>');
  console.error('Run scan-device.mjs first to find your device ID.');
  process.exit(1);
}

let found = false;

noble.on('stateChange', (state) => {
  if (state === 'poweredOn') noble.startScanningAsync([], false);
});

noble.on('discover', async (peripheral) => {
  if (peripheral.id !== deviceId || found) return;
  found = true;
  noble.stopScanning();

  console.log(`Found: ${peripheral.advertisement?.localName || 'unknown'} (${peripheral.id})`);
  console.log(`RSSI: ${peripheral.rssi} dBm\n`);

  try {
    await peripheral.connectAsync();
    console.log('Connected. Discovering services...\n');

    const services = await new Promise((resolve) =>
      peripheral.discoverServices([], (err, svcs) => resolve(svcs || []))
    );

    for (const service of services) {
      console.log(`Service: ${service.uuid}`);
      const chars = await new Promise((resolve) =>
        service.discoverCharacteristics([], (err, cs) => resolve(cs || []))
      );
      for (const c of chars) {
        const props = c.properties || [];
        const writeType = props.includes('writeWithoutResponse')
          ? '⚡ writeWithoutResponse'
          : props.includes('write')
            ? '✏️  write (with response)'
            : '';
        const notify = props.includes('notify') ? '📡 notify' : '';
        console.log(`  ${c.uuid}: ${JSON.stringify(props)}`);
        if (writeType || notify) {
          console.log(`         ${[writeType, notify].filter(Boolean).join(' | ')}`);
        }
      }
      console.log();
    }

    await peripheral.disconnectAsync();
    console.log('Disconnected cleanly.');
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
});

setTimeout(() => {
  if (!found) {
    console.error(`Device ${deviceId} not found within 15 seconds.`);
    process.exit(1);
  }
}, 15000);
