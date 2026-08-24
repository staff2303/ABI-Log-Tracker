export interface DecodePayloadResult {
  decodedBytes: number;
  checksum: number;
}

type DecodeMode = 3 | 4;

const map03 = buildMap03();
const map04 = buildMap04();

function identityMap(): Uint8Array {
  const map = new Uint8Array(256);

  for (let index = 0; index < 256; index += 1) {
    map[index] = index;
  }

  return map;
}

function buildMap03(): Uint8Array {
  const map = identityMap();

  map[0x40] = 0x58;
  map[0x41] = 0x59;
  map[0x42] = 0x5a;
  map[0x43] = 0x5b;
  map[0x44] = 0x5c;
  map[0x45] = 0x5d;
  map[0x46] = 0x5e;
  map[0x47] = 0x5f;

  map[0x4c] = 0x44;
  map[0x4d] = 0x45;
  map[0x4f] = 0x47;
  map[0x50] = 0x42;
  map[0x51] = 0x43;
  map[0x52] = 0x4c;
  map[0x53] = 0x4d;
  map[0x54] = 0x46;
  map[0x56] = 0x40;
  map[0x57] = 0x41;
  map[0x58] = 0x50;
  map[0x59] = 0x51;
  map[0x5a] = 0x52;
  map[0x5b] = 0x53;
  map[0x5c] = 0x54;
  map[0x5d] = 0x4f;
  map[0x5e] = 0x56;
  map[0x5f] = 0x57;

  map[0x60] = 0x7e;
  map[0x61] = 0x7f;
  map[0x62] = 0x78;
  map[0x63] = 0x79;
  map[0x64] = 0x72;
  map[0x65] = 0x73;
  map[0x66] = 0x7c;
  map[0x67] = 0x7d;

  map[0x6c] = 0x7a;
  map[0x6d] = 0x7b;
  map[0x6f] = 0x65;
  map[0x70] = 0x60;
  map[0x71] = 0x61;
  map[0x72] = 0x62;
  map[0x73] = 0x63;
  map[0x74] = 0x64;
  map[0x76] = 0x66;
  map[0x77] = 0x67;
  map[0x78] = 0x76;
  map[0x79] = 0x77;
  map[0x7a] = 0x70;
  map[0x7b] = 0x71;
  map[0x7c] = 0x6c;
  map[0x7d] = 0x6d;
  map[0x7e] = 0x74;
  map[0x7f] = 0x6f;

  return map;
}

function buildMap04(): Uint8Array {
  const map = identityMap();

  map[0x17] = 0x09;
  map[0x20] = 0x36;
  map[0x21] = 0x37;
  map[0x22] = 0x30;
  map[0x23] = 0x27;
  map[0x24] = 0x3a;
  map[0x26] = 0x34;
  map[0x27] = 0x35;
  map[0x28] = 0x20;
  map[0x29] = 0x21;
  map[0x2a] = 0x22;
  map[0x2b] = 0x39;
  map[0x2d] = 0x25;
  map[0x2f] = 0x27;
  map[0x30] = 0x28;
  map[0x31] = 0x29;
  map[0x33] = 0x2b;
  map[0x34] = 0x2c;
  map[0x35] = 0x2d;
  map[0x36] = 0x2e;
  map[0x37] = 0x2f;
  map[0x39] = 0x31;
  map[0x3a] = 0x32;
  map[0x3b] = 0x33;

  return map;
}

function updateChecksum(checksum: number, value: number): number {
  return Math.imul(checksum ^ value, 0x01000193) >>> 0;
}

export function decodePayloadForValidation(
  src: Uint8Array<ArrayBufferLike>,
  start: number,
  count: number,
  mode: DecodeMode,
): DecodePayloadResult {
  const end = start + count;
  const map = mode === 3 ? map03 : map04;
  const xorKey = mode === 3 ? 0x35 : 0x43;
  let decodedBytes = 0;
  let checksum = 0x811c9dc5;
  let index = start;

  while (index < end) {
    let byte = src[index];

    if (byte === 0x02 && index + 1 < end) {
      const next = src[index + 1];

      if (mode === 3 && next === 0x02) {
        checksum = updateChecksum(checksum, 0x0d);
        decodedBytes += 1;
        index += 2;
        continue;
      }

      if (mode === 3 && next === 0x01) {
        checksum = updateChecksum(checksum, 0x0a);
        decodedBytes += 1;
        index += 2;
        continue;
      }

      if (next === 0x03) {
        byte = 0x02;
        index += 2;
      } else if (next === 0x04) {
        byte = 0x01;
        index += 2;
      } else if (next === 0x05) {
        byte = 0x0a;
        index += 2;
      } else if (next === 0x06) {
        byte = 0x0d;
        index += 2;
      } else {
        index += 1;
      }
    } else {
      index += 1;
    }

    const decoded = map[byte ^ xorKey];
    checksum = updateChecksum(checksum, decoded);
    decodedBytes += 1;
  }

  return { decodedBytes, checksum };
}

export function decodePayloadToBytes(src: Uint8Array<ArrayBufferLike>, start: number, count: number, mode: DecodeMode): Uint8Array {
  const end = start + count;
  const map = mode === 3 ? map03 : map04;
  const xorKey = mode === 3 ? 0x35 : 0x43;
  const temp = new Uint8Array(count + 16);
  let outputOffset = 0;
  let index = start;

  while (index < end) {
    let byte = src[index];

    if (byte === 0x02 && index + 1 < end) {
      const next = src[index + 1];

      if (mode === 3 && next === 0x02) {
        temp[outputOffset] = 0x0d;
        outputOffset += 1;
        index += 2;
        continue;
      }

      if (mode === 3 && next === 0x01) {
        temp[outputOffset] = 0x0a;
        outputOffset += 1;
        index += 2;
        continue;
      }

      if (next === 0x03) {
        byte = 0x02;
        index += 2;
      } else if (next === 0x04) {
        byte = 0x01;
        index += 2;
      } else if (next === 0x05) {
        byte = 0x0a;
        index += 2;
      } else if (next === 0x06) {
        byte = 0x0d;
        index += 2;
      } else {
        index += 1;
      }
    } else {
      index += 1;
    }

    temp[outputOffset] = map[byte ^ xorKey];
    outputOffset += 1;
  }

  return temp.slice(0, outputOffset);
}
