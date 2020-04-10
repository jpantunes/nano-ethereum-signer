const lib = (fn) => {
  var exports = null;
  return () => {
    exports = exports || fn();
    return exports;
  };
};

const lib_buffer = lib(() => {
  var exports = {};

  exports.Buffer = Buffer
  exports.INSPECT_MAX_BYTES = 50

  /**
  * If `Buffer.TYPED_ARRAY_SUPPORT`:
  *   === true    Use Uint8Array implementation (fastest)
  *   === false   Use Object implementation (most compatible, even IE6)
  *
  * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
  * Opera 11.6+, iOS 4.2+.
  *
  * Due to various browser bugs, sometimes the Object implementation will be used even
  * when the browser supports typed arrays.
  *
  * Note:
  *
  *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
  *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
  *
  *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
  *
  *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
  *     incorrect length in some situations.

  * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
  * get the Object implementation, which is slower but behaves correctly.
  */
  Buffer.TYPED_ARRAY_SUPPORT = true;

  /*
  * Export kMaxLength after typed array support is determined.
  */
  exports.kMaxLength = kMaxLength()

  function typedArraySupport () {
    try {
      var arr = new Uint8Array(1)
      arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
      return arr.foo() === 42 && // typed array instances can be augmented
          typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
          arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
    } catch (e) {
      return false
    }
  }

  function kMaxLength () {
    return Buffer.TYPED_ARRAY_SUPPORT
      ? 0x7fffffff
      : 0x3fffffff
  }

  function createBuffer (that, length) {
    if (kMaxLength() < length) {
      throw new RangeError('Invalid typed array length')
    }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = new Uint8Array(length)
      that.__proto__ = Buffer.prototype
    } else {
      // Fallback: Return an object instance of the Buffer class
      if (that === null) {
        that = new Buffer(length)
      }
      that.length = length
    }

    return that
  }

  /**
  * The Buffer constructor returns instances of `Uint8Array` that have their
  * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
  * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
  * and the `Uint8Array` methods. Square bracket notation works as expected -- it
  * returns a single octet.
  *
  * The `Uint8Array` prototype remains unmodified.
  */

  function Buffer (arg, encodingOrOffset, length) {};

  function from (that, value, encodingOrOffset, length) {
    return fromString(that, value, encodingOrOffset)
  }

  /**
  * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
  * if value is a number.
  * Buffer.from(str[, encoding])
  * Buffer.from(array)
  * Buffer.from(buffer)
  * Buffer.from(arrayBuffer[, byteOffset[, length]])
  **/
  Buffer.from = function (value, encodingOrOffset, length) {
    return from(null, value, encodingOrOffset, length)
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    Buffer.prototype.__proto__ = Uint8Array.prototype
    Buffer.__proto__ = Uint8Array
    if (typeof Symbol !== 'undefined' && Symbol.species &&
        Buffer[Symbol.species] === Buffer) {
      // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
      Object.defineProperty(Buffer, Symbol.species, {
        value: null,
        configurable: true
      })
    }
  }

  function fromString (that, string, encoding) {
    var length = byteLength(string, encoding) | 0
    that = createBuffer(that, length)
    var actual = that.write(string, encoding)
    if (actual !== length) {
      that = that.slice(0, actual)
    }
    return that
  }

  Buffer.isBuffer = function isBuffer (b) {
    return !!(b != null && b._isBuffer)
  }

  function byteLength (string, encoding) {
    return string.length >>> 1;
  }
  Buffer.byteLength = byteLength

  // The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
  // Buffer instances.
  Buffer.prototype._isBuffer = true

  function hexWrite (buf, string, offset, length) {
    offset = Number(offset) || 0
    var remaining = buf.length - offset
    if (!length) {
      length = remaining
    } else {
      length = Number(length)
      if (length > remaining) {
        length = remaining
      }
    }

    // must be an even number of digits
    var strLen = string.length
    if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

    if (length > strLen / 2) {
      length = strLen / 2
    }
    for (var i = 0; i < length; ++i) {
      var parsed = parseInt(string.substr(i * 2, 2), 16)
      if (isNaN(parsed)) return i
      buf[offset + i] = parsed
    }
    return i
  }

  Buffer.prototype.write = function write (string, offset, length, encoding) {
    return hexWrite(this, string, 0, this.length);
  }

  return exports;
});

const lib_keccak = lib(() => {
  var exports = {};

  const HEX_CHARS = '0123456789abcdef'.split('');
  const KECCAK_PADDING = [1, 256, 65536, 16777216];
  const SHIFT = [0, 8, 16, 24];
  const RC = [1, 0, 32898, 0, 32906, 2147483648, 2147516416, 2147483648, 32907, 0, 2147483649, 0, 2147516545, 2147483648, 32777, 2147483648, 138, 0, 136, 0, 2147516425, 0, 2147483658, 0, 2147516555, 0, 139, 2147483648, 32905, 2147483648, 32771, 2147483648, 32770, 2147483648, 128, 2147483648, 32778, 0, 2147483658, 2147483648, 2147516545, 2147483648, 32896, 2147483648, 2147483649, 0, 2147516424, 2147483648];
  const Keccak = bits => ({
    blocks: [],
    reset: true,
    block: 0,
    start: 0,
    blockCount: 1600 - (bits << 1) >> 5,
    outputBlocks: bits >> 5,
    s: (s => [].concat(s, s, s, s, s))([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  });
  const update = (state, message) => {
    var length = message.length,
        blocks = state.blocks,
        byteCount = state.blockCount << 2,
        blockCount = state.blockCount,
        outputBlocks = state.outputBlocks,
        s = state.s,
        index = 0,
        i,
        code;

    // update
    while (index < length) {
      if (state.reset) {
        state.reset = false;
        blocks[0] = state.block;
        for (i = 1; i < blockCount + 1; ++i) {
          blocks[i] = 0;
        }
      }
      if (typeof message !== "string") {
        for (i = state.start; index < length && i < byteCount; ++index) {
          blocks[i >> 2] |= message[index] << SHIFT[i++ & 3];
        }
      } else {
        for (i = state.start; index < length && i < byteCount; ++index) {
          code = message.charCodeAt(index);
          if (code < 0x80) {
            blocks[i >> 2] |= code << SHIFT[i++ & 3];
          } else if (code < 0x800) {
            blocks[i >> 2] |= (0xc0 | code >> 6) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | code & 0x3f) << SHIFT[i++ & 3];
          } else if (code < 0xd800 || code >= 0xe000) {
            blocks[i >> 2] |= (0xe0 | code >> 12) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | code >> 6 & 0x3f) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | code & 0x3f) << SHIFT[i++ & 3];
          } else {
            code = 0x10000 + ((code & 0x3ff) << 10 | message.charCodeAt(++index) & 0x3ff);
            blocks[i >> 2] |= (0xf0 | code >> 18) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | code >> 12 & 0x3f) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | code >> 6 & 0x3f) << SHIFT[i++ & 3];
            blocks[i >> 2] |= (0x80 | code & 0x3f) << SHIFT[i++ & 3];
          }
        }
      }
      state.lastByteIndex = i;
      if (i >= byteCount) {
        state.start = i - byteCount;
        state.block = blocks[blockCount];
        for (i = 0; i < blockCount; ++i) {
          s[i] ^= blocks[i];
        }
        f(s);
        state.reset = true;
      } else {
        state.start = i;
      }
    }

    // finalize
    i = state.lastByteIndex;
    blocks[i >> 2] |= KECCAK_PADDING[i & 3];
    if (state.lastByteIndex === byteCount) {
      blocks[0] = blocks[blockCount];
      for (i = 1; i < blockCount + 1; ++i) {
        blocks[i] = 0;
      }
    }
    blocks[blockCount - 1] |= 0x80000000;
    for (i = 0; i < blockCount; ++i) {
      s[i] ^= blocks[i];
    }
    f(s);

    // toString
    var hex = '', j = 0, block;
    i = 0;
    while (j < outputBlocks) {
      for (i = 0; i < blockCount && j < outputBlocks; ++i, ++j) {
        block = s[i];
        hex += HEX_CHARS[block >> 4 & 0x0F] + HEX_CHARS[block & 0x0F] + HEX_CHARS[block >> 12 & 0x0F] + HEX_CHARS[block >> 8 & 0x0F] + HEX_CHARS[block >> 20 & 0x0F] + HEX_CHARS[block >> 16 & 0x0F] + HEX_CHARS[block >> 28 & 0x0F] + HEX_CHARS[block >> 24 & 0x0F];
      }
      if (j % blockCount === 0) {
        f(s);
        i = 0;
      }
    }
    return "0x" + hex;
  };

  const f = s => {
    var h, l, n, c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15, b16, b17, b18, b19, b20, b21, b22, b23, b24, b25, b26, b27, b28, b29, b30, b31, b32, b33, b34, b35, b36, b37, b38, b39, b40, b41, b42, b43, b44, b45, b46, b47, b48, b49;

    for (n = 0; n < 48; n += 2) {
      c0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40];
      c1 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
      c2 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42];
      c3 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
      c4 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44];
      c5 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
      c6 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46];
      c7 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
      c8 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48];
      c9 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];

      h = c8 ^ (c2 << 1 | c3 >>> 31);
      l = c9 ^ (c3 << 1 | c2 >>> 31);
      s[0] ^= h;
      s[1] ^= l;
      s[10] ^= h;
      s[11] ^= l;
      s[20] ^= h;
      s[21] ^= l;
      s[30] ^= h;
      s[31] ^= l;
      s[40] ^= h;
      s[41] ^= l;
      h = c0 ^ (c4 << 1 | c5 >>> 31);
      l = c1 ^ (c5 << 1 | c4 >>> 31);
      s[2] ^= h;
      s[3] ^= l;
      s[12] ^= h;
      s[13] ^= l;
      s[22] ^= h;
      s[23] ^= l;
      s[32] ^= h;
      s[33] ^= l;
      s[42] ^= h;
      s[43] ^= l;
      h = c2 ^ (c6 << 1 | c7 >>> 31);
      l = c3 ^ (c7 << 1 | c6 >>> 31);
      s[4] ^= h;
      s[5] ^= l;
      s[14] ^= h;
      s[15] ^= l;
      s[24] ^= h;
      s[25] ^= l;
      s[34] ^= h;
      s[35] ^= l;
      s[44] ^= h;
      s[45] ^= l;
      h = c4 ^ (c8 << 1 | c9 >>> 31);
      l = c5 ^ (c9 << 1 | c8 >>> 31);
      s[6] ^= h;
      s[7] ^= l;
      s[16] ^= h;
      s[17] ^= l;
      s[26] ^= h;
      s[27] ^= l;
      s[36] ^= h;
      s[37] ^= l;
      s[46] ^= h;
      s[47] ^= l;
      h = c6 ^ (c0 << 1 | c1 >>> 31);
      l = c7 ^ (c1 << 1 | c0 >>> 31);
      s[8] ^= h;
      s[9] ^= l;
      s[18] ^= h;
      s[19] ^= l;
      s[28] ^= h;
      s[29] ^= l;
      s[38] ^= h;
      s[39] ^= l;
      s[48] ^= h;
      s[49] ^= l;

      b0 = s[0];
      b1 = s[1];
      b32 = s[11] << 4 | s[10] >>> 28;
      b33 = s[10] << 4 | s[11] >>> 28;
      b14 = s[20] << 3 | s[21] >>> 29;
      b15 = s[21] << 3 | s[20] >>> 29;
      b46 = s[31] << 9 | s[30] >>> 23;
      b47 = s[30] << 9 | s[31] >>> 23;
      b28 = s[40] << 18 | s[41] >>> 14;
      b29 = s[41] << 18 | s[40] >>> 14;
      b20 = s[2] << 1 | s[3] >>> 31;
      b21 = s[3] << 1 | s[2] >>> 31;
      b2 = s[13] << 12 | s[12] >>> 20;
      b3 = s[12] << 12 | s[13] >>> 20;
      b34 = s[22] << 10 | s[23] >>> 22;
      b35 = s[23] << 10 | s[22] >>> 22;
      b16 = s[33] << 13 | s[32] >>> 19;
      b17 = s[32] << 13 | s[33] >>> 19;
      b48 = s[42] << 2 | s[43] >>> 30;
      b49 = s[43] << 2 | s[42] >>> 30;
      b40 = s[5] << 30 | s[4] >>> 2;
      b41 = s[4] << 30 | s[5] >>> 2;
      b22 = s[14] << 6 | s[15] >>> 26;
      b23 = s[15] << 6 | s[14] >>> 26;
      b4 = s[25] << 11 | s[24] >>> 21;
      b5 = s[24] << 11 | s[25] >>> 21;
      b36 = s[34] << 15 | s[35] >>> 17;
      b37 = s[35] << 15 | s[34] >>> 17;
      b18 = s[45] << 29 | s[44] >>> 3;
      b19 = s[44] << 29 | s[45] >>> 3;
      b10 = s[6] << 28 | s[7] >>> 4;
      b11 = s[7] << 28 | s[6] >>> 4;
      b42 = s[17] << 23 | s[16] >>> 9;
      b43 = s[16] << 23 | s[17] >>> 9;
      b24 = s[26] << 25 | s[27] >>> 7;
      b25 = s[27] << 25 | s[26] >>> 7;
      b6 = s[36] << 21 | s[37] >>> 11;
      b7 = s[37] << 21 | s[36] >>> 11;
      b38 = s[47] << 24 | s[46] >>> 8;
      b39 = s[46] << 24 | s[47] >>> 8;
      b30 = s[8] << 27 | s[9] >>> 5;
      b31 = s[9] << 27 | s[8] >>> 5;
      b12 = s[18] << 20 | s[19] >>> 12;
      b13 = s[19] << 20 | s[18] >>> 12;
      b44 = s[29] << 7 | s[28] >>> 25;
      b45 = s[28] << 7 | s[29] >>> 25;
      b26 = s[38] << 8 | s[39] >>> 24;
      b27 = s[39] << 8 | s[38] >>> 24;
      b8 = s[48] << 14 | s[49] >>> 18;
      b9 = s[49] << 14 | s[48] >>> 18;

      s[0] = b0 ^ ~b2 & b4;
      s[1] = b1 ^ ~b3 & b5;
      s[10] = b10 ^ ~b12 & b14;
      s[11] = b11 ^ ~b13 & b15;
      s[20] = b20 ^ ~b22 & b24;
      s[21] = b21 ^ ~b23 & b25;
      s[30] = b30 ^ ~b32 & b34;
      s[31] = b31 ^ ~b33 & b35;
      s[40] = b40 ^ ~b42 & b44;
      s[41] = b41 ^ ~b43 & b45;
      s[2] = b2 ^ ~b4 & b6;
      s[3] = b3 ^ ~b5 & b7;
      s[12] = b12 ^ ~b14 & b16;
      s[13] = b13 ^ ~b15 & b17;
      s[22] = b22 ^ ~b24 & b26;
      s[23] = b23 ^ ~b25 & b27;
      s[32] = b32 ^ ~b34 & b36;
      s[33] = b33 ^ ~b35 & b37;
      s[42] = b42 ^ ~b44 & b46;
      s[43] = b43 ^ ~b45 & b47;
      s[4] = b4 ^ ~b6 & b8;
      s[5] = b5 ^ ~b7 & b9;
      s[14] = b14 ^ ~b16 & b18;
      s[15] = b15 ^ ~b17 & b19;
      s[24] = b24 ^ ~b26 & b28;
      s[25] = b25 ^ ~b27 & b29;
      s[34] = b34 ^ ~b36 & b38;
      s[35] = b35 ^ ~b37 & b39;
      s[44] = b44 ^ ~b46 & b48;
      s[45] = b45 ^ ~b47 & b49;
      s[6] = b6 ^ ~b8 & b0;
      s[7] = b7 ^ ~b9 & b1;
      s[16] = b16 ^ ~b18 & b10;
      s[17] = b17 ^ ~b19 & b11;
      s[26] = b26 ^ ~b28 & b20;
      s[27] = b27 ^ ~b29 & b21;
      s[36] = b36 ^ ~b38 & b30;
      s[37] = b37 ^ ~b39 & b31;
      s[46] = b46 ^ ~b48 & b40;
      s[47] = b47 ^ ~b49 & b41;
      s[8] = b8 ^ ~b0 & b2;
      s[9] = b9 ^ ~b1 & b3;
      s[18] = b18 ^ ~b10 & b12;
      s[19] = b19 ^ ~b11 & b13;
      s[28] = b28 ^ ~b20 & b22;
      s[29] = b29 ^ ~b21 & b23;
      s[38] = b38 ^ ~b30 & b32;
      s[39] = b39 ^ ~b31 & b33;
      s[48] = b48 ^ ~b40 & b42;
      s[49] = b49 ^ ~b41 & b43;

      s[0] ^= RC[n];
      s[1] ^= RC[n + 1];
    }
  };

  const keccak = bits => (str, force_utf8 = false) => {
    var msg;
    if (str.slice(0, 2) === "0x" && !force_utf8) {
      msg = [];
      for (var i = 2, l = str.length; i < l; i += 2) msg.push(parseInt(str.slice(i, i + 2), 16));
    } else {
      msg = str;
    }
    return update(Keccak(bits, bits), msg);
  };

  exports = {keccak256: keccak(256)};

  return exports;
});

const lib_noble_secp256k1 = lib(() => {
  'use strict';
  Object.defineProperty(exports, "__esModule", { value: true });

  const CURVE = {
      a: 0n,
      b: 7n,
      P: 2n ** 256n - 2n ** 32n - 977n,
      n: 2n ** 256n - 432420386565659656852420866394968145599n,
      h: 1n,
      Gx: 55066263022277343669578718895168534326250603453777594175500187360389116729240n,
      Gy: 32670510020758816978083085130507043184471273380659243275938904335757337482424n,
      beta: 0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501een
  };
  exports.CURVE = CURVE;
  const P_DIV4_1 = (CURVE.P + 1n) / 4n;
  function weistrass(x) {
      const { a, b } = CURVE;
      return mod(x ** 3n + a * x + b);
  }
  const PRIME_SIZE = 256;
  const USE_ENDOMORPHISM = CURVE.a === 0n;
  class JacobianPoint {
      constructor(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
      }
      static fromAffine(p) {
          return new JacobianPoint(p.x, p.y, 1n);
      }
      static fromAffineBatch(points) {
          const toInv = invertBatch(points.map(p => p.z));
          return points.map((p, i) => p.toAffine(toInv[i]));
      }
      equals(other) {
          const a = this;
          const b = other;
          const az2 = mod(a.z * a.z);
          const az3 = mod(a.z * az2);
          const bz2 = mod(b.z * b.z);
          const bz3 = mod(b.z * bz2);
          return mod(a.x * bz2) === mod(az2 * b.x) && mod(a.y * bz3) === mod(az3 * b.y);
      }
      negate() {
          return new JacobianPoint(this.x, mod(-this.y), this.z);
      }
      double() {
          const X1 = this.x;
          const Y1 = this.y;
          const Z1 = this.z;
          const A = X1 ** 2n;
          const B = Y1 ** 2n;
          const C = B ** 2n;
          const D = 2n * ((X1 + B) ** 2n - A - C);
          const E = 3n * A;
          const F = E ** 2n;
          const X3 = mod(F - 2n * D);
          const Y3 = mod(E * (D - X3) - 8n * C);
          const Z3 = mod(2n * Y1 * Z1);
          return new JacobianPoint(X3, Y3, Z3);
      }
      add(other) {
          const X1 = this.x;
          const Y1 = this.y;
          const Z1 = this.z;
          const X2 = other.x;
          const Y2 = other.y;
          const Z2 = other.z;
          if (X2 === 0n || Y2 === 0n)
              return this;
          if (X1 === 0n || Y1 === 0n)
              return other;
          const Z1Z1 = Z1 ** 2n;
          const Z2Z2 = Z2 ** 2n;
          const U1 = X1 * Z2Z2;
          const U2 = X2 * Z1Z1;
          const S1 = Y1 * Z2 * Z2Z2;
          const S2 = Y2 * Z1 * Z1Z1;
          const H = mod(U2 - U1);
          const r = mod(S2 - S1);
          if (H === 0n) {
              if (r === 0n) {
                  return this.double();
              }
              else {
                  return JacobianPoint.ZERO;
              }
          }
          const HH = mod(H ** 2n);
          const HHH = mod(H * HH);
          const V = U1 * HH;
          const X3 = mod(r ** 2n - HHH - 2n * V);
          const Y3 = mod(r * (V - X3) - S1 * HHH);
          const Z3 = mod(Z1 * Z2 * H);
          return new JacobianPoint(X3, Y3, Z3);
      }
      multiplyUnsafe(scalar) {
          if (typeof scalar !== 'number' && typeof scalar !== 'bigint') {
              throw new TypeError('Point#multiply: expected number or bigint');
          }
          let n = mod(BigInt(scalar), CURVE.n);
          if (n <= 0) {
              throw new Error('Point#multiply: invalid scalar, expected positive integer');
          }
          if (!USE_ENDOMORPHISM) {
              let p = JacobianPoint.ZERO;
              let d = this;
              while (n > 0n) {
                  if (n & 1n)
                      p = p.add(d);
                  d = d.double();
                  n >>= 1n;
              }
              return p;
          }
          let [k1neg, k1, k2neg, k2] = splitScalar(n);
          let k1p = JacobianPoint.ZERO;
          let k2p = JacobianPoint.ZERO;
          let d = this;
          while (k1 > 0n || k2 > 0n) {
              if (k1 & 1n)
                  k1p = k1p.add(d);
              if (k2 & 1n)
                  k2p = k2p.add(d);
              d = d.double();
              k1 >>= 1n;
              k2 >>= 1n;
          }
          if (k1neg)
              k1p = k1p.negate();
          if (k2neg)
              k2p = k2p.negate();
          k2p = new JacobianPoint(mod(k2p.x * CURVE.beta), k2p.y, k2p.z);
          return k1p.add(k2p);
      }
      toAffine(invZ = invert(this.z)) {
          const invZ2 = invZ ** 2n;
          const x = mod(this.x * invZ2);
          const y = mod(this.y * invZ2 * invZ);
          return new Point(x, y);
      }
  }
  JacobianPoint.BASE = new JacobianPoint(CURVE.Gx, CURVE.Gy, 1n);
  JacobianPoint.ZERO = new JacobianPoint(0n, 0n, 1n);
  const pointPrecomputes = new WeakMap();
  class Point {
      constructor(x, y) {
          this.x = x;
          this.y = y;
      }
      _setWindowSize(windowSize) {
          this.WINDOW_SIZE = windowSize;
          pointPrecomputes.delete(this);
      }
      static isValid(x, y) {
          if (x === 0n || y === 0n || x >= CURVE.P || y >= CURVE.P)
              return false;
          const sqrY = mod(y * y);
          const yEquivalence = weistrass(x);
          const left1 = sqrY;
          const left2 = mod(-sqrY);
          const right1 = yEquivalence;
          const right2 = mod(-yEquivalence);
          return left1 === right1 || left1 === right2 || left2 === right1 || left2 === right2;
      }
      static fromCompressedHex(bytes) {
          if (bytes.length !== 33) {
              throw new TypeError(`Point.fromHex: compressed expects 66 bytes, not ${bytes.length * 2}`);
          }
          const x = arrayToNumber(bytes.slice(1));
          const sqrY = weistrass(x);
          let y = powMod(sqrY, P_DIV4_1, CURVE.P);
          const isFirstByteOdd = (bytes[0] & 1) === 1;
          const isYOdd = (y & 1n) === 1n;
          if (isFirstByteOdd !== isYOdd) {
              y = mod(-y);
          }
          if (!this.isValid(x, y)) {
              throw new TypeError('Point.fromHex: Point is not on elliptic curve');
          }
          return new Point(x, y);
      }
      static fromUncompressedHex(bytes) {
          if (bytes.length !== 65) {
              throw new TypeError(`Point.fromHex: uncompressed expects 130 bytes, not ${bytes.length * 2}`);
          }
          const x = arrayToNumber(bytes.slice(1, 33));
          const y = arrayToNumber(bytes.slice(33));
          if (!this.isValid(x, y)) {
              throw new TypeError('Point.fromHex: Point is not on elliptic curve');
          }
          return new Point(x, y);
      }
      static fromHex(hex) {
          const bytes = hex instanceof Uint8Array ? hex : hexToArray(hex);
          const header = bytes[0];
          if (header === 0x02 || header === 0x03)
              return this.fromCompressedHex(bytes);
          if (header === 0x04)
              return this.fromUncompressedHex(bytes);
          throw new TypeError('Point.fromHex: received invalid point');
      }
      static fromPrivateKey(privateKey) {
          return Point.BASE.multiply(normalizePrivateKey(privateKey));
      }
      static fromSignature(msgHash, signature, recovery) {
          const sign = normalizeSignature(signature);
          const { r, s } = sign;
          if (r === 0n || s === 0n)
              return;
          const rinv = invert(r, CURVE.n);
          const h = typeof msgHash === 'string' ? hexToNumber(msgHash) : arrayToNumber(msgHash);
          const P_ = Point.fromHex(`0${2 + (recovery & 1)}${pad64(r)}`);
          const sP = JacobianPoint.fromAffine(P_).multiplyUnsafe(s);
          const hG = Point.BASE.multiply(h, false).negate();
          const Q = sP.add(hG).multiplyUnsafe(rinv);
          return Q.toAffine();
      }
      toRawBytes(isCompressed = false) {
          return hexToArray(this.toHex(isCompressed));
      }
      toHex(isCompressed = false) {
          const x = pad64(this.x);
          if (isCompressed) {
              return `${this.y & 1n ? '03' : '02'}${x}`;
          }
          else {
              return `04${x}${pad64(this.y)}`;
          }
      }
      equals(other) {
          return this.x === other.x && this.y === other.y;
      }
      negate() {
          return new Point(this.x, mod(-this.y));
      }
      double() {
          const X1 = this.x;
          const Y1 = this.y;
          const lambda = mod(3n * X1 ** 2n * invert(2n * Y1));
          const X3 = mod(lambda * lambda - 2n * X1);
          const Y3 = mod(lambda * (X1 - X3) - Y1);
          return new Point(X3, Y3);
      }
      add(other) {
          if (!(other instanceof Point)) {
              throw new TypeError('Point#add: expected Point');
          }
          const a = this;
          const b = other;
          const X1 = a.x;
          const Y1 = a.y;
          const X2 = b.x;
          const Y2 = b.y;
          if (a.equals(Point.ZERO))
              return b;
          if (b.equals(Point.ZERO))
              return a;
          if (X1 === X2) {
              if (Y1 === Y2) {
                  return this.double();
              }
              else {
                  throw new TypeError('Point#add: cannot add points (a.x == b.x, a.y != b.y)');
              }
          }
          const lambda = mod((Y2 - Y1) * invert(X2 - X1));
          const X3 = mod(lambda * lambda - X1 - X2);
          const Y3 = mod(lambda * (X1 - X3) - Y1);
          return new Point(X3, Y3);
      }
      subtract(other) {
          return this.add(other.negate());
      }
      precomputeWindow(W) {
          const cached = pointPrecomputes.get(this);
          if (cached)
              return cached;
          const windows = USE_ENDOMORPHISM ? 128 / W + 2 : 256 / W + 1;
          let points = [];
          let p = JacobianPoint.fromAffine(this);
          let base = p;
          for (let window = 0; window < windows; window++) {
              base = p;
              points.push(base);
              for (let i = 1; i < 2 ** (W - 1); i++) {
                  base = base.add(p);
                  points.push(base);
              }
              p = base.double();
          }
          if (W !== 1) {
              points = JacobianPoint.fromAffineBatch(points).map(JacobianPoint.fromAffine);
              pointPrecomputes.set(this, points);
          }
          return points;
      }
      wNAF(n, isHalf = false) {
          const W = this.WINDOW_SIZE || 1;
          if (256 % W) {
              throw new Error('Point#wNAF: Invalid precomputation window, must be power of 2');
          }
          const precomputes = this.precomputeWindow(W);
          let p = JacobianPoint.ZERO;
          let f = JacobianPoint.ZERO;
          const windows = isHalf ? 128 / W + 2 : 256 / W + 1;
          const windowSize = 2 ** (W - 1);
          const mask = BigInt(2 ** W - 1);
          const maxNumber = 2 ** W;
          const shiftBy = BigInt(W);
          for (let window = 0; window < windows; window++) {
              const offset = window * windowSize;
              let wbits = Number(n & mask);
              n >>= shiftBy;
              if (wbits > windowSize) {
                  wbits -= maxNumber;
                  n += 1n;
              }
              if (wbits === 0) {
                  f = f.add(precomputes[offset]);
              }
              else {
                  const cached = precomputes[offset + Math.abs(wbits) - 1];
                  p = p.add(wbits < 0 ? cached.negate() : cached);
              }
          }
          return [p, f];
      }
      multiply(scalar, isAffine = true) {
          if (typeof scalar !== 'number' && typeof scalar !== 'bigint') {
              throw new TypeError('Point#multiply: expected number or bigint');
          }
          let n = mod(BigInt(scalar), CURVE.n);
          if (n <= 0) {
              throw new Error('Point#multiply: invalid scalar, expected positive integer');
          }
          if (scalar > CURVE.n) {
              throw new Error('Point#multiply: invalid scalar, expected < CURVE.n');
          }
          let point;
          let fake;
          if (USE_ENDOMORPHISM) {
              const [k1neg, k1, k2neg, k2] = splitScalar(n);
              let k1p, k2p, f1p, f2p;
              [k1p, f1p] = this.wNAF(k1, true);
              [k2p, f2p] = this.wNAF(k2, true);
              if (k1neg)
                  k1p = k1p.negate();
              if (k2neg)
                  k2p = k2p.negate();
              k2p = new JacobianPoint(mod(k2p.x * CURVE.beta), k2p.y, k2p.z);
              point = k1p.add(k2p);
              fake = f1p.add(f2p);
          }
          else {
              [point, fake] = this.wNAF(n);
          }
          return isAffine ? JacobianPoint.fromAffineBatch([point, fake])[0] : point;
      }
  }
  exports.Point = Point;
  Point.BASE = new Point(CURVE.Gx, CURVE.Gy);
  Point.ZERO = new Point(0n, 0n);
  class SignResult {
      constructor(r, s) {
          this.r = r;
          this.s = s;
      }
      static fromHex(hex) {
          const str = hex instanceof Uint8Array ? arrayToHex(hex) : hex;
          if (typeof str !== 'string')
              throw new TypeError({}.toString.call(hex));
          const check1 = str.slice(0, 2);
          const length = parseByte(str.slice(2, 4));
          const check2 = str.slice(4, 6);
          if (check1 !== '30' || length !== str.length - 4 || check2 !== '02') {
              throw new Error('SignResult.fromHex: Invalid signature');
          }
          const rLen = parseByte(str.slice(6, 8));
          const rEnd = 8 + rLen;
          const r = hexToNumber(str.slice(8, rEnd));
          const check3 = str.slice(rEnd, rEnd + 2);
          if (check3 !== '02') {
              throw new Error('SignResult.fromHex: Invalid signature');
          }
          const sLen = parseByte(str.slice(rEnd + 2, rEnd + 4));
          const sStart = rEnd + 4;
          const s = hexToNumber(str.slice(sStart, sStart + sLen));
          return new SignResult(r, s);
      }
      toRawBytes(isCompressed = false) {
          return hexToArray(this.toHex(isCompressed));
      }
      toHex(isCompressed = false) {
          const sHex = numberToHex(this.s);
          if (isCompressed)
              return sHex;
          const rHex = numberToHex(this.r);
          const rLen = numberToHex(rHex.length / 2);
          const sLen = numberToHex(sHex.length / 2);
          const length = numberToHex(rHex.length / 2 + sHex.length / 2 + 4);
          return `30${length}02${rLen}${rHex}02${sLen}${sHex}`;
      }
  }
  exports.SignResult = SignResult;
  let hmac;
  let randomPrivateKey = (bytesLength = 32) => new Uint8Array(bytesLength);
  if (typeof window == 'object' && 'crypto' in window) {
      hmac = async (key, ...messages) => {
          const ckey = await window.crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign', 'verify']);
          const message = concatTypedArrays(...messages);
          const buffer = await window.crypto.subtle.sign('HMAC', ckey, message);
          return new Uint8Array(buffer);
      };
      randomPrivateKey = (bytesLength = 32) => {
          return window.crypto.getRandomValues(new Uint8Array(bytesLength));
      };
  }
  else if (typeof process === 'object' && 'node' in process.versions) {
      const req = require;
      const { createHmac, randomBytes } = req('crypto');
      hmac = async (key, ...messages) => {
          const hash = createHmac('sha256', key);
          for (let message of messages) {
              hash.update(message);
          }
          return Uint8Array.from(hash.digest());
      };
      randomPrivateKey = (bytesLength = 32) => {
          return new Uint8Array(randomBytes(bytesLength).buffer);
      };
  }
  else {
      throw new Error("The environment doesn't have hmac-sha256 function");
  }
  function concatTypedArrays(...arrays) {
      if (arrays.length === 1)
          return arrays[0];
      const length = arrays.reduce((a, arr) => a + arr.length, 0);
      const result = new Uint8Array(length);
      for (let i = 0, pad = 0; i < arrays.length; i++) {
          const arr = arrays[i];
          result.set(arr, pad);
          pad += arr.length;
      }
      return result;
  }
  function arrayToHex(uint8a) {
      let hex = '';
      for (let i = 0; i < uint8a.length; i++) {
          hex += uint8a[i].toString(16).padStart(2, '0');
      }
      return hex;
  }
  function pad64(num) {
      return num.toString(16).padStart(64, '0');
  }
  function numberToHex(num) {
      const hex = num.toString(16);
      return hex.length & 1 ? `0${hex}` : hex;
  }
  function hexToNumber(hex) {
      if (typeof hex !== 'string') {
          throw new TypeError('hexToNumber: expected string, got ' + typeof hex);
      }
      return BigInt(`0x${hex}`);
  }
  function hexToArray(hex) {
      hex = hex.length & 1 ? `0${hex}` : hex;
      const array = new Uint8Array(hex.length / 2);
      for (let i = 0; i < array.length; i++) {
          let j = i * 2;
          array[i] = Number.parseInt(hex.slice(j, j + 2), 16);
      }
      return array;
  }
  function arrayToNumber(bytes) {
      return hexToNumber(arrayToHex(bytes));
  }
  function parseByte(str) {
      return Number.parseInt(str, 16) * 2;
  }
  function mod(a, b = CURVE.P) {
      const result = a % b;
      return result >= 0 ? result : b + result;
  }
  function powMod(x, power, order) {
      let res = 1n;
      while (power > 0) {
          if (power & 1n) {
              res = mod(res * x, order);
          }
          power >>= 1n;
          x = mod(x * x, order);
      }
      return res;
  }
  function egcd(a, b) {
      let [x, y, u, v] = [0n, 1n, 1n, 0n];
      while (a !== 0n) {
          let q = b / a;
          let r = b % a;
          let m = x - u * q;
          let n = y - v * q;
          [b, a] = [a, r];
          [x, y] = [u, v];
          [u, v] = [m, n];
      }
      let gcd = b;
      return [gcd, x, y];
  }
  function invert(number, modulo = CURVE.P) {
      if (number === 0n || modulo <= 0n) {
          throw new Error('invert: expected positive integers');
      }
      let [gcd, x] = egcd(mod(number, modulo), modulo);
      if (gcd !== 1n) {
          throw new Error('invert: does not exist');
      }
      return mod(x, modulo);
  }
  function invertBatch(nums, n = CURVE.P) {
      const len = nums.length;
      const scratch = new Array(len);
      let acc = 1n;
      for (let i = 0; i < len; i++) {
          if (nums[i] === 0n)
              continue;
          scratch[i] = acc;
          acc = mod(acc * nums[i], n);
      }
      acc = invert(acc, n);
      for (let i = len - 1; i >= 0; i--) {
          if (nums[i] === 0n)
              continue;
          let tmp = mod(acc * nums[i], n);
          nums[i] = mod(acc * scratch[i], n);
          acc = tmp;
      }
      return nums;
  }
  function splitScalar(k) {
      const { n } = CURVE;
      const a1 = 0x3086d221a7d46bcde86c90e49284eb15n;
      const b1 = -0xe4437ed6010e88286f547fa90abfe4c3n;
      const a2 = 0x114ca50f7a8e2f3f657c1108d9d44cfd8n;
      const b2 = 0x3086d221a7d46bcde86c90e49284eb15n;
      const c1 = (b2 * k) / n;
      const c2 = (-b1 * k) / n;
      const k1 = k - c1 * a1 - c2 * a2;
      const k2 = -c1 * b1 - c2 * b2;
      const k1neg = k1 < 0;
      const k2neg = k2 < 0;
      return [k1neg, k1neg ? -k1 : k1, k2neg, k2neg ? -k2 : k2];
  }
  function truncateHash(hash) {
      hash = typeof hash === 'string' ? hash : arrayToHex(hash);
      let msg = hexToNumber(hash || '0');
      const delta = (hash.length / 2) * 8 - PRIME_SIZE;
      if (delta > 0) {
          msg = msg >> BigInt(delta);
      }
      if (msg >= CURVE.n) {
          msg -= CURVE.n;
      }
      return msg;
  }
  async function getQRSrfc6979(msgHash, privateKey) {
      const num = typeof msgHash === 'string' ? hexToNumber(msgHash) : arrayToNumber(msgHash);
      const h1 = hexToArray(pad64(num));
      const x = hexToArray(pad64(privateKey));
      const h1n = arrayToNumber(h1);
      let v = new Uint8Array(32).fill(1);
      let k = new Uint8Array(32).fill(0);
      const b0 = Uint8Array.from([0x00]);
      const b1 = Uint8Array.from([0x01]);
      k = await hmac(k, v, b0, x, h1);
      v = await hmac(k, v);
      k = await hmac(k, v, b1, x, h1);
      v = await hmac(k, v);
      for (let i = 0; i < 1000; i++) {
          v = await hmac(k, v);
          const T = arrayToNumber(v);
          let qrs;
          if (isValidPrivateKey(T) && (qrs = calcQRSFromK(T, h1n, privateKey))) {
              return qrs;
          }
          k = await hmac(k, v, b0);
          v = await hmac(k, v);
      }
      throw new TypeError('secp256k1: Tried 1,000 k values for sign(), all were invalid');
  }
  function isValidPrivateKey(privateKey) {
      return 0 < privateKey && privateKey < CURVE.n;
  }
  function calcQRSFromK(k, msg, priv) {
      const max = CURVE.n;
      const q = Point.BASE.multiply(k);
      const r = mod(q.x, max);
      const s = mod(invert(k, max) * (msg + r * priv), max);
      if (r === 0n || s === 0n)
          return;
      return [q, r, s];
  }
  function normalizePrivateKey(privateKey) {
      let key;
      if (privateKey instanceof Uint8Array) {
          key = arrayToNumber(privateKey);
      }
      else if (typeof privateKey === 'string') {
          key = hexToNumber(privateKey);
      }
      else {
          key = BigInt(privateKey);
      }
      return key;
  }
  function normalizePublicKey(publicKey) {
      return publicKey instanceof Point ? publicKey : Point.fromHex(publicKey);
  }
  function normalizeSignature(signature) {
      return signature instanceof SignResult ? signature : SignResult.fromHex(signature);
  }
  function getPublicKey(privateKey, isCompressed) {
      const point = Point.fromPrivateKey(privateKey);
      if (typeof privateKey === 'string') {
          return point.toHex(isCompressed);
      }
      return point.toRawBytes(isCompressed);
  }
  exports.getPublicKey = getPublicKey;
  function recoverPublicKey(msgHash, signature, recovery) {
      const point = Point.fromSignature(msgHash, signature, recovery);
      if (!point)
          return;
      return typeof msgHash === 'string' ? point.toHex() : point.toRawBytes();
  }
  exports.recoverPublicKey = recoverPublicKey;
  function getSharedSecret(privateA, publicB) {
      const point = publicB instanceof Point ? publicB : Point.fromHex(publicB);
      const shared = point.multiply(normalizePrivateKey(privateA));
      return typeof privateA === 'string' ? shared.toHex() : shared.toRawBytes();
  }
  exports.getSharedSecret = getSharedSecret;
  async function sign(msgHash, privateKey, { recovered, canonical } = {}) {
      const priv = normalizePrivateKey(privateKey);
      if (!isValidPrivateKey(priv)) {
          throw new Error('Private key is invalid. Expected 0 < key < CURVE.n');
      }
      const [q, r, s] = await getQRSrfc6979(msgHash, priv);
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & 1n);
      let adjustedS = s;
      const HIGH_NUMBER = CURVE.n >> 1n;
      if (s > HIGH_NUMBER && canonical) {
          adjustedS = CURVE.n - s;
          recovery ^= 1;
      }
      const sig = new SignResult(r, adjustedS);
      const hashed = typeof msgHash === 'string' ? sig.toHex() : sig.toRawBytes();
      return recovered ? [hashed, recovery] : hashed;
  }
  exports.sign = sign;
  function verify(signature, msgHash, publicKey) {
      const h = truncateHash(msgHash);
      const { r, s } = normalizeSignature(signature);
      const pubKey = JacobianPoint.fromAffine(normalizePublicKey(publicKey));
      const s1 = invert(s, CURVE.n);
      const Ghs1 = Point.BASE.multiply(mod(h * s1, CURVE.n), false);
      const Prs1 = pubKey.multiplyUnsafe(mod(r * s1, CURVE.n));
      const res = Ghs1.add(Prs1).toAffine();
      return res.x === r;
  }
  exports.verify = verify;
  Point.BASE._setWindowSize(8);
  exports.utils = {
      isValidPrivateKey(privateKey) {
          return isValidPrivateKey(normalizePrivateKey(privateKey));
      },
      randomPrivateKey,
      precompute(windowSize = 8, point = Point.BASE) {
          const cached = point === Point.BASE ? point : new Point(point.x, point.y);
          cached._setWindowSize(windowSize);
          cached.multiply(3n);
          return cached;
      }
  };
  return exports;
});

const lib_account = lib(() => {
  var exports = {};

  /* WEBPACK VAR INJECTION */
 (function(Buffer) {

  const { keccak256 } = lib_keccak();
  const secp256k1 = lib_noble_secp256k1();

  const addressChecksum = address => {
    const addressHash = keccak256(address.slice(2));
    let checksumAddress = "0x";
    for (let i = 0; i < 40; i++) checksumAddress += parseInt(addressHash[i + 2], 16) > 7 ? address[i + 2].toUpperCase() : address[i + 2];
    return checksumAddress;
  };

  const addressFromKey = privateKey => {
    let pubKey = secp256k1.getPublicKey(privateKey.slice(2));
    let pubKeyHash = keccak256(Buffer.from(pubKey.slice(2), 'hex'));
    let address = '0x' + pubKeyHash.slice(-40);
    return addressChecksum(address);
  };

  const signMessage = async (hash, privateKey) => {
    let signature = await secp256k1.sign(hash.slice(2), privateKey.slice(2));
    return signature;
  };

  const signerAddress = (hash, signature) => {
    let recoveredPubkey = secp256k1.recoverPublicKey(hash.slice(2), signature);
    let pubKeyHash = keccak256(Buffer.from(recoveredPubkey.slice(2), 'hex'));
    let address = '0x' + pubKeyHash.slice(-40)
    return addressChecksum(address);
  };

  exports = {
    addressChecksum,
    addressFromKey,
    signMessage,
    signerAddress,
  };
  /* WEBPACK VAR INJECTION */}.call(this, lib_buffer().Buffer))

  return exports;
});

var acc = lib_account();
module["exports"]["addressChecksum"] = acc.addressChecksum;
module["exports"]["addressFromKey"] = acc.addressFromKey;
module["exports"]["signMessage"] = acc.signMessage;
module["exports"]["signerAddress"] = acc.signerAddress;
module["exports"]["keccak"] = lib_keccak().keccak256;
