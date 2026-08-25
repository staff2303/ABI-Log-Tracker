export class Sha256 {
  private readonly state = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  private readonly buffer = new Uint8Array(64);
  private bufferLength = 0;
  private bytesHashed = 0;
  private finished = false;

  update(data: Uint8Array): void {
    if (this.finished) {
      throw new Error("SHA-256 digest has already been finalized.");
    }

    let position = 0;
    this.bytesHashed += data.length;

    while (position < data.length) {
      const take = Math.min(data.length - position, 64 - this.bufferLength);
      this.buffer.set(data.subarray(position, position + take), this.bufferLength);
      this.bufferLength += take;
      position += take;

      if (this.bufferLength === 64) {
        this.processBlock(this.buffer);
        this.bufferLength = 0;
      }
    }
  }

  digestHex(): string {
    return Array.from(this.digest())
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  digest(): Uint8Array {
    if (this.finished) {
      throw new Error("SHA-256 digest has already been finalized.");
    }

    this.finished = true;

    const bitLengthHigh = Math.floor((this.bytesHashed * 8) / 0x100000000);
    const bitLengthLow = (this.bytesHashed * 8) >>> 0;

    this.buffer[this.bufferLength++] = 0x80;

    if (this.bufferLength > 56) {
      this.buffer.fill(0, this.bufferLength, 64);
      this.processBlock(this.buffer);
      this.bufferLength = 0;
    }

    this.buffer.fill(0, this.bufferLength, 56);
    writeUint32(this.buffer, 56, bitLengthHigh);
    writeUint32(this.buffer, 60, bitLengthLow);
    this.processBlock(this.buffer);

    const result = new Uint8Array(32);
    for (let index = 0; index < this.state.length; index += 1) {
      writeUint32(result, index * 4, this.state[index]);
    }

    return result;
  }

  private processBlock(block: Uint8Array): void {
    const words = new Uint32Array(64);

    for (let index = 0; index < 16; index += 1) {
      words[index] =
        (block[index * 4] << 24) |
        (block[index * 4 + 1] << 16) |
        (block[index * 4 + 2] << 8) |
        block[index * 4 + 3];
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = add(words[index - 16], s0, words[index - 7], s1);
    }

    let a = this.state[0];
    let b = this.state[1];
    let c = this.state[2];
    let d = this.state[3];
    let e = this.state[4];
    let f = this.state[5];
    let g = this.state[6];
    let h = this.state[7];

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = add(h, s1, ch, K[index], words[index]);
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = add(s0, maj);

      h = g;
      g = f;
      f = e;
      e = add(d, temp1);
      d = c;
      c = b;
      b = a;
      a = add(temp1, temp2);
    }

    this.state[0] = add(this.state[0], a);
    this.state[1] = add(this.state[1], b);
    this.state[2] = add(this.state[2], c);
    this.state[3] = add(this.state[3], d);
    this.state[4] = add(this.state[4], e);
    this.state[5] = add(this.state[5], f);
    this.state[6] = add(this.state[6], g);
    this.state[7] = add(this.state[7], h);
  }
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function add(...values: number[]): number {
  return values.reduce((sum, value) => (sum + value) >>> 0, 0);
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24;
  target[offset + 1] = value >>> 16;
  target[offset + 2] = value >>> 8;
  target[offset + 3] = value;
}
