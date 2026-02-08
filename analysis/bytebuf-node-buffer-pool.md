# Node.js Buffer Pool vs DataView: The ByteBuf Bug

## The Problem

Node.js `Buffer` uses a shared memory pool (default 8KB) for small allocations. When you create a Buffer:

```javascript
const buf = Buffer.from('554904930102', 'hex');  // 6 bytes
```

Internally, Node.js does NOT allocate a 6-byte ArrayBuffer. Instead:

```javascript
buf.buffer;       // → SharedArrayBuffer (8192 bytes!)
buf.byteOffset;   // → 4096 (somewhere in the pool)
buf.byteLength;   // → 6 (the actual data length)
```

The 6 bytes live at offset 4096 within a shared 8KB ArrayBuffer.

## How ByteBuf Broke

`ByteBuf` extends `DataView`, which itself wraps the ArrayBuffer:

```javascript
class ByteBuf extends DataView {
    #byteOffset: number = super.byteOffset;  // ← BUG: this is 4096, not 0!
    
    readUint8(): number {
        const value = this.getUint8(this.#byteOffset);  // reads at 4096+0, not 0!
        this.#byteOffset++;
        return value;
    }
}
```

When `#byteOffset` starts at `super.byteOffset` (e.g., 4096), the first read goes to position 4096 in the DataView. But `DataView.getUint8(offset)` already accounts for its internal byteOffset, so:

```
Actual memory position = ArrayBuffer[super.byteOffset + offset]
                       = ArrayBuffer[4096 + 4096]
                       = ArrayBuffer[8192]  ← OUT OF BOUNDS!
```

## The Three Bugs

### Bug 1: `#byteOffset` initialization
```diff
- #byteOffset: number = super.byteOffset;
+ #byteOffset: number = 0;
```

### Bug 2: `ByteBuf.from()` missing byteLength
```javascript
// Before: DataView spans entire 8KB pool
new ByteBuf(source.buffer, source.byteOffset);

// After: DataView limited to actual data
new ByteBuf(source.buffer, source.byteOffset, source.byteLength);
```

### Bug 3: `getUint24()` raw array access
```javascript
// Before: reads from pool start
const bytes = new Uint8Array(this.buffer);
const b0 = bytes[byteOffset];

// After: reads from correct position  
const base = super.byteOffset + byteOffset;
const bytes = new Uint8Array(this.buffer);
const b0 = bytes[base];
```

## Impact

| Bug | Effect |
|-----|--------|
| #1 | Every byte read at wrong position → "Bad first byte" for all messages |
| #2 | DataView wraps 8KB instead of message → reads garbage after message end |
| #3 | `getUint24()` reads type from pool start → ALL messages decode to type=1794 |

Bug #3 was especially insidious because it made every message appear to be the same type, creating false positive matches in the state machine.

## How to Detect This Bug Pattern

If you're wrapping Node.js Buffers in DataView or TypedArray:

```javascript
const buf = Buffer.from('deadbeef', 'hex');
console.log('buffer.byteOffset:', buf.byteOffset);  // If > 0, you have a pool buffer
console.log('buffer.byteLength:', buf.byteLength);   // This is your ACTUAL length
console.log('buffer.buffer.byteLength:', buf.buffer.byteLength);  // This is the POOL size
```

Always use all three parameters when creating DataView from Buffer:
```javascript
new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
```
