// Arbitrary Precision Math Engine using BigInt-based decimal arithmetic

class AP {
    constructor(value, precision) {
        this.precision = precision || 50;
        if (value instanceof AP) {
            this.m = value.m; this.e = value.e; return;
        }
        if (typeof value === 'bigint') { this.m = value; this.e = 0; return; }
        if (typeof value === 'number') { this._fromNum(value); return; }
        this._fromStr(String(value));
    }

    _fromNum(v) {
        if (!isFinite(v)) throw new Error('Non-finite');
        if (v === 0) { this.m = 0n; this.e = 0; return; }
        const s = String(v);
        if (s.includes('e') || s.includes('E')) {
            const [mant, exp] = s.split(/[eE]/);
            const base = new AP(parseFloat(mant));
            this.m = base.m; this.e = base.e + parseInt(exp); return;
        }
        if (!s.includes('.')) { this.m = BigInt(s); this.e = 0; return; }
        const [i, f] = s.split('.');
        this.m = BigInt(i + f); this.e = -f.length;
    }

    _fromStr(s) {
        s = s.trim();
        if (s.includes('e') || s.includes('E')) {
            const parts = s.split(/[eE]/);
            const base = new AP(parseFloat(parts[0]));
            this.m = base.m; this.e = base.e + parseInt(parts[1]); return;
        }
        if (!s.includes('.')) { this.m = BigInt(s); this.e = 0; return; }
        const [intP, fracP] = s.split('.');
        this.m = BigInt(intP + fracP); this.e = -fracP.length;
    }

    static from(n, p) { return new AP(n, p); }
    static zero(p) { const r = new AP(0n); r.precision = p || 50; return r; }
    static one(p) { const r = new AP(1n); r.precision = p || 50; return r; }

    clone() { const r = new AP(this.m); r.e = this.e; r.precision = this.precision; return r; }

    normalize() {
        let m = this.m, e = this.e;
        if (m === 0n) { this.e = 0; return this; }
        while (m % 10n === 0n) { m /= 10n; e++; }
        this.m = m; this.e = e; return this;
    }

    _trim(digits) {
        const cur = this._digits();
        if (cur > digits) { const d = cur - digits; this.m /= 10n ** BigInt(d); this.e += d; }
        return this;
    }

    _digits() { return this.m === 0n ? 1 : this.m.toString().length; }

    add(b) {
        const p = Math.max(this.precision, b.precision);
        let m1 = this.m, e1 = this.e, m2 = b.m, e2 = b.e;
        if (e1 > e2) { m1 *= 10n ** BigInt(e1 - e2); e1 = e2; }
        else if (e2 > e1) { m2 *= 10n ** BigInt(e2 - e1); e2 = e1; }
        const r = new AP(0n); r.m = m1 + m2; r.e = e1; r.precision = p;
        r.normalize(); if (r._digits() > p + 5) r._trim(p + 5); return r;
    }

    sub(b) {
        const p = Math.max(this.precision, b.precision);
        let m1 = this.m, e1 = this.e, m2 = b.m, e2 = b.e;
        if (e1 > e2) { m1 *= 10n ** BigInt(e1 - e2); e1 = e2; }
        else if (e2 > e1) { m2 *= 10n ** BigInt(e2 - e1); e2 = e1; }
        const r = new AP(0n); r.m = m1 - m2; r.e = e1; r.precision = p;
        r.normalize(); if (r._digits() > p + 5) r._trim(p + 5); return r;
    }

    mul(b) {
        const p = Math.max(this.precision, b.precision);
        const r = new AP(0n);
        r.m = this.m * b.m; r.e = this.e + b.e; r.precision = p;
        r.normalize(); if (r._digits() > p + 5) r._trim(p + 5); return r;
    }

    div(b, extra) {
        if (b.m === 0n) throw new Error('Division by zero');
        const p = Math.max(this.precision, b.precision) + (extra || 10);
        let m1 = this.m, m2 = b.m;
        const need = p + 5;
        const cur = m1.toString().replace(/^-/, '').length;
        if (cur < need) m1 *= 10n ** BigInt(need - cur);
        const r = new AP(0n);
        r.m = m1 / m2; r.e = this.e - b.e - (need - cur); r.precision = p;
        r.normalize(); r._trim(p); return r;
    }

    neg() { const r = this.clone(); r.m = -r.m; return r; }
    abs() { const r = this.clone(); if (r.m < 0n) r.m = -r.m; return r; }

    cmp(b) {
        let m1 = this.m, e1 = this.e, m2 = b.m, e2 = b.e;
        if (e1 > e2) m1 *= 10n ** BigInt(e1 - e2);
        else if (e2 > e1) m2 *= 10n ** BigInt(e2 - e1);
        return m1 < m2 ? -1 : m1 > m2 ? 1 : 0;
    }
    gt(b) { return this.cmp(b) > 0; }
    lt(b) { return this.cmp(b) < 0; }
    gte(b) { return this.cmp(b) >= 0; }
    lte(b) { return this.cmp(b) <= 0; }
    eq(b) { return this.cmp(b) === 0; }
    isZero() { return this.m === 0n; }
    isPos() { return this.m > 0n; }
    isNeg() { return this.m < 0n; }

    toNumber() { return parseFloat(this.toString()); }

    toString() {
        if (this.m === 0n) return '0';
        const s = this.m.toString();
        const e = this.e;
        const neg = s[0] === '-';
        const digits = neg ? s.slice(1) : s;
        let result;
        if (e >= 0) {
            result = digits + '0'.repeat(e);
        } else {
            const pos = digits.length + e;
            if (pos <= 0) {
                result = '0.' + '0'.repeat(-pos) + digits;
            } else {
                result = digits.slice(0, pos) + '.' + digits.slice(pos);
            }
        }
        return neg ? '-' + result : result;
    }

    toFixed(d) {
        let s = this.toString();
        if (!s.includes('.')) s += '.';
        const [i, f] = s.split('.');
        return i + '.' + f.padEnd(d, '0').slice(0, d);
    }

    floor() {
        const s = this.toString();
        if (!s.includes('.')) return this.clone();
        const intP = s.split('.')[0];
        if (this.isNeg()) {
            const absInt = BigInt(intP.replace('-', ''));
            const frac = s.split('.')[1];
            if (frac && parseInt(frac) > 0) return new AP(-(absInt + 1n));
            return this.clone();
        }
        return new AP(intP);
    }

    powInt(n) {
        if (n === 0) return AP.one(this.precision);
        if (n === 1) return this.clone();
        if (n < 0) return AP.one(this.precision).div(this.powInt(-n), 20);
        let r = AP.one(this.precision), base = this.clone();
        let k = n;
        while (k > 0) {
            if (k & 1) r = r.mul(base);
            base = base.mul(base);
            k >>= 1;
        }
        return r._trim(this.precision + 10);
    }

    sqrt(extra) {
        if (this.isNeg()) throw new Error('sqrt of negative');
        if (this.isZero()) return AP.zero(this.precision);
        const p = this.precision + (extra || 20);
        // Newton's method: x_{n+1} = (x_n + a/x_n) / 2
        // Initial guess from JS float
        let xNum = this.toNumber();
        xNum = Math.sqrt(Math.abs(xNum));
        let x = AP.from(xNum, p);
        x.precision = p;

        const two = new AP(2n); two.precision = p;
        const eps = AP.from('1e-' + String(Math.min(p, 50)), p);

        for (let i = 0; i < p * 5; i++) {
            const xn = x.add(this.div(x, 20)).div(two, 20);
            if (xn.sub(x).abs().lt(eps)) break;
            x = xn;
        }
        return x._trim(this.precision);
    }

    powFrac(exp, extra) {
        return _apExp(exp.mul(_apLn(this, extra || 30)), extra || 30);
    }

    static PI(p) { return _apPI(p || 50); }
    static E(p) { return _apExp(AP.one(p || 50), 30); }
}

// --- Helper: small epsilon ---
function _eps(p) {
    return AP.from('1e-' + String(Math.min(p, 60)), p);
}

// --- Special functions ---

function _apLn(a, extra) {
    if (a.isNeg() || a.isZero()) throw new Error('ln of non-positive');
    const p = a.precision + (extra || 30);
    const one = AP.one(p);
    const ten = AP.from('10', p);
    const ln10 = AP.from('2.302585092994045684017991454684364207601101488628772976033327900967572609677352480235997205089598298339743133552523', p);
    let x = a.clone(); x.precision = p;
    let k = 0;
    while (x.gte(ten)) { x = x.div(ten, extra); k++; }
    while (x.lt(one)) { x = x.mul(ten); k--; }
    // series: ln(x) = 2 * sum ((x-1)/(x+1))^{2n+1} / (2n+1)
    const t = x.sub(one).div(x.add(one), extra);
    const t2 = t.mul(t);
    let term = t.clone(), sum = AP.zero(p);
    const eps = _eps(p);
    for (let n = 0; n < p * 10; n++) {
        sum = sum.add(term.div(AP.from(BigInt(2 * n + 1)), extra));
        term = term.mul(t2);
        if (term.abs().lt(eps)) break;
    }
    sum = sum.mul(AP.from('2', p));
    if (k !== 0) sum = sum.add(ln10.mul(AP.from(BigInt(k), p)));
    return sum._trim(a.precision);
}

function _apExp(a, extra) {
    const p = a.precision + (extra || 30);
    const x = a.clone(); x.precision = p;
    // Reduce: write x = k*ln(2) + r
    const ln2 = AP.from('0.693147180559945309417232121458176568075500134360255254120680009493393', p);
    const ratio = x.div(ln2, extra);
    const k = Math.round(ratio.toNumber());
    const r = x.sub(ln2.mul(AP.from(BigInt(k), p)));
    // Taylor series for exp(r)
    let sum = AP.one(p), term = AP.one(p);
    const eps = _eps(p);
    for (let n = 1; n < p * 10; n++) {
        term = term.mul(r).div(AP.from(BigInt(n)), extra);
        sum = sum.add(term);
        if (term.abs().lt(eps)) break;
    }
    if (k !== 0) {
        const twoPowK = AP.from('2', p).powInt(Math.abs(k));
        if (k > 0) sum = sum.mul(twoPowK);
        else sum = sum.div(twoPowK, extra);
    }
    return sum._trim(a.precision);
}

function _apSin(a, extra) {
    const p = a.precision + (extra || 30);
    const pi = _apPI(p);
    const twoPi = pi.mul(AP.from('2', p));
    let x = a.clone(); x.precision = p;
    if (x.abs().gt(twoPi)) {
        const q = x.div(twoPi, extra + 10);
        const qn = Math.round(q.toNumber());
        x = x.sub(twoPi.mul(AP.from(qn, p)));
    }
    const x2 = x.mul(x);
    let term = x.clone(), sum = x.clone();
    const eps = _eps(p);
    for (let n = 1; n < p * 10; n++) {
        term = term.mul(x2).neg();
        sum = sum.add(term.div(new AP(_factBig(2 * n + 1)), extra));
        if (term.abs().lt(eps)) break;
    }
    return sum._trim(a.precision);
}

function _apCos(a, extra) {
    const p = a.precision + (extra || 30);
    const pi = _apPI(p);
    const twoPi = pi.mul(AP.from('2', p));
    let x = a.clone(); x.precision = p;
    if (x.abs().gt(twoPi)) {
        const q = x.div(twoPi, extra + 10);
        const qn = Math.round(q.toNumber());
        x = x.sub(twoPi.mul(AP.from(qn, p)));
    }
    const x2 = x.mul(x);
    let term = AP.one(p), sum = AP.one(p);
    const eps = _eps(p);
    for (let n = 1; n < p * 10; n++) {
        term = term.mul(x2).neg();
        sum = sum.add(term.div(new AP(_factBig(2 * n)), extra));
        if (term.abs().lt(eps)) break;
    }
    return sum._trim(a.precision);
}

function _apTan(a, extra) {
    const p = a.precision + (extra || 30);
    return _apSin(a, extra).div(_apCos(a, extra), extra);
}

function _apASin(a, extra) {
    const p = a.precision + (extra || 30);
    if (a.abs().gt(AP.one(p))) throw new Error('asin: |x|>1');
    const x2 = a.mul(a);
    let coeff = AP.one(p), term = a.clone(), sum = a.clone();
    const eps = _eps(p);
    for (let n = 1; n < p * 8; n++) {
        coeff = coeff.mul(new AP(BigInt(2 * n - 1))).div(new AP(BigInt(2 * n)), extra);
        term = term.mul(x2);
        const contrib = coeff.div(new AP(BigInt(2 * n + 1)), extra).mul(term);
        sum = sum.add(contrib);
        if (contrib.abs().lt(eps)) break;
    }
    return sum._trim(a.precision);
}

function _apAtan(a, extra) {
    const p = a.precision + (extra || 30);
    if (a.abs().gt(AP.one(p))) {
        const piHalf = _apPI(p).div(AP.from('2', p), extra);
        return piHalf.sub(_apAtan(AP.one(p).div(a, extra), extra));
    }
    if (a.abs().gt(AP.from('0.7', p))) {
        const sqrtP = AP.one(p).add(a.mul(a)).sqrt(extra);
        const halfArg = a.div(AP.one(p).add(sqrtP), extra);
        return _apAtan(halfArg, extra).mul(AP.from('2', p));
    }
    const x2 = a.mul(a);
    let term = a.clone(), sum = AP.zero(p);
    const eps = _eps(p);
    for (let n = 0; n < p * 10; n++) {
        sum = sum.add(term.div(AP.from(BigInt(2 * n + 1)), extra));
        term = term.mul(x2).neg();
        if (term.abs().lt(eps)) break;
    }
    return sum._trim(a.precision);
}

function _apGamma(a, extra) {
    const p = a.precision + (extra || 30);
    const x = a.clone();
    if (x.isNeg() && x.eq(x.floor())) throw new Error('Gamma: pole');
    if (x.lt(AP.from('0.5', p))) {
        const pi = _apPI(p);
        const sinPiX = _apSin(pi.mul(x), extra);
        const g1mx = _apGamma(AP.one(p).sub(x), extra);
        return pi.div(sinPiX.mul(g1mx), extra)._trim(a.precision);
    }
    const g = 7;
    const c = ['0.99999999999980993','676.5203681218851','-1259.1392167224028','771.32342877765313','-176.61502916214059','12.507343278686905','-0.13857109526572012','9.9843695780195716e-6','1.5056327351493116e-7'];
    let z = x.sub(AP.one(p));
    let t = z.add(new AP(g + 0.5));
    let sum = AP.from(c[0], p);
    for (let i = 1; i <= g + 1; i++) sum = sum.add(AP.from(c[i], p).div(z.add(new AP(i)), extra));
    const sq2pi = AP.from('2.506628274631000502415765284811045253006986740668', p);
    const result = sq2pi.mul(t.powFrac(z.add(AP.from('0.5', p)), extra)).mul(_apExp(t.neg(), extra)).mul(sum);
    return result._trim(a.precision);
}

function _apErf(a, extra) {
    const p = a.precision + (extra || 30);
    const twoSqrtPi = AP.from('1.128379167095512573896158903121545171688101258659', p);
    const x2 = a.mul(a);
    let term = a.clone(), sum = a.clone();
    const eps = _eps(p);
    for (let n = 1; n < p * 8; n++) {
        term = term.mul(x2).neg();
        const denom = new AP(_factBig(n) * BigInt(2 * n + 1));
        sum = sum.add(term.div(denom, extra));
        if (term.abs().div(denom).lt(eps)) break;
    }
    return twoSqrtPi.mul(sum)._trim(a.precision);
}

function _apZeta(s, extra) {
    const p = s.precision + (extra || 30);
    if (s.eq(AP.one(p))) throw new Error('Zeta: pole at s=1');
    const N = 2000;
    let sum = AP.zero(p);
    const oneP = AP.one(p);
    for (let n = 1; n <= N; n++) {
        sum = sum.add(oneP.div(AP.from(BigInt(n)).powFrac(s, extra), extra));
    }
    const h = AP.from(BigInt(N));
    const hInvS = oneP.div(h.powFrac(s, extra), extra);
    const correction1 = h.powFrac(oneP.sub(s), extra).div(s.sub(oneP), extra);
    const correction2 = hInvS.div(AP.from('2', p));
    return sum.add(correction1).add(correction2)._trim(s.precision);
}

function _apPI(p) {
    p = p || 50;
    const pp = p + 30;
    const a1 = _apAtan(AP.one(pp).div(AP.from('5', pp), 20), 30);
    const a2 = _apAtan(AP.one(pp).div(AP.from('239', pp), 20), 30);
    return a1.mul(AP.from('4', pp)).sub(a2).mul(AP.from('4', pp))._trim(p);
}

function _factBig(n) {
    if (n <= 1) return 1n;
    let r = 1n;
    for (let i = 2; i <= n; i++) r *= BigInt(i);
    return r;
}

function _isPrime(n) {
    if (n < 2n) return false;
    if (n < 4n) return true;
    if (n % 2n === 0n || n % 3n === 0n) return false;
    for (let i = 5n; i * i <= n; i += 6n)
        if (n % i === 0n || n % (i + 2n) === 0n) return false;
    return true;
}

function _gcd(a, b) { while (b !== 0n) { [a, b] = [b, a % b]; } return a; }

function _binom(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
}

function _apSigmoid(x, minArg, maxArg, curveArg, p) {
    p = p || 50;
    const lo = minArg || AP.zero(p);
    const hi = maxArg || AP.one(p);
    if (lo.gt(hi)) throw new Error('sigmoid: min > max');
    const range = hi.sub(lo);
    const half = range.div(AP.from('2', p), 10);
    const center = lo.add(half);

    const curve = curveArg ? curveArg.toString().toLowerCase().replace(/"/g, '') : 'logistic';
    let raw;
    switch (curve) {
        case 'logistic': case 'lg': {
            if (x.isPos() || x.isZero()) {
                const emx = _apExp(x.neg(), 30);
                raw = AP.one(p).div(AP.one(p).add(emx), 15);
            } else {
                const ex = _apExp(x, 30);
                raw = ex.div(AP.one(p).add(ex), 15);
            }
            break;
        }
        case 'tanh': case 'th': {
            const e2x = _apExp(x.mul(AP.from('2', p)), 30);
            raw = e2x.sub(AP.one(p)).div(e2x.add(AP.one(p)), 15);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        case 'softsign': case 'ss': {
            raw = x.div(AP.one(p).add(x.abs()), 15);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        case 'arctan': case 'at': {
            const pi = _apPI(p);
            raw = _apAtan(x, 30).mul(AP.from('2', p)).div(pi, 15);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        case 'algebraic': case 'al': {
            const x2 = x.mul(x);
            raw = x.div(x2.add(AP.one(p)).sqrt(15), 15);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        case 'hard': case 'hr': {
            const one = AP.one(p);
            if (x.cmp(one) > 0) raw = one;
            else if (x.cmp(one.neg()) < 0) raw = AP.zero(p);
            else raw = x.add(one).div(AP.from('2', p), 15);
            break;
        }
        case 'erf': case 'er': {
            raw = _apErf(x, 30);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        case 'sqrt': case 'rt': {
            const x2 = x.mul(x);
            raw = x.div(x2.add(AP.one(p)).sqrt(15).add(AP.one(p)), 15);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        case 'quartic': case 'qr': {
            const x4 = x.mul(x).mul(x).mul(x);
            raw = x.div(x4.add(AP.one(p)).sqrt(15), 15);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        case 'exponential': case 'ex': {
            const absx = x.abs();
            const one = AP.one(p);
            const ex = _apExp(absx.neg(), 30);
            const base = one.sub(ex);
            raw = x.isNeg() ? base.neg() : base;
            raw = raw.add(one).div(AP.from('2', p), 15);
            break;
        }
        case 'smoothstep': case 's3': {
            const t = x.add(AP.one(p)).div(AP.from('2', p), 15);
            const t2 = t.mul(t);
            raw = t2.mul(AP.from('3', p)).sub(t2.mul(t).mul(AP.from('2', p)));
            break;
        }
        case 'smootherstep': case 's5': {
            const t = x.add(AP.one(p)).div(AP.from('2', p), 15);
            const t3 = t.mul(t).mul(t);
            const t4 = t3.mul(t);
            const t5 = t4.mul(t);
            raw = t5.mul(AP.from('6', p)).sub(t4.mul(AP.from('15', p))).add(t3.mul(AP.from('10', p)));
            break;
        }
        case 'smooth+': case 's+': {
            const x2 = x.mul(x);
            const sqrtTerm = x2.add(AP.one(p)).sqrt(15);
            const expTerm = _apExp(sqrtTerm, 30);
            raw = x.div(AP.one(p).add(_apLn(expTerm.add(AP.one(p)), 15)), 15);
            raw = raw.add(AP.one(p)).div(AP.from('2', p), 15);
            break;
        }
        default: throw new Error('Unknown sigmoid curve: ' + curve);
    }
    return lo.add(range.mul(raw))._trim(p);
}
