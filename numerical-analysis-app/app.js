// ============================================================
// Expression Parser
// ============================================================

class Parser {
    constructor(expr, precision) {
        this.expr = expr.replace(/\s+/g, '');
        this.pos = 0;
        this.p = precision || 50;
    }
    parse() { const r = this.parseExpr(); if (this.pos < this.expr.length) throw new Error('Unexpected: ' + this.expr[this.pos]); return r; }
    parseExpr() {
        let left = this.parseTerm();
        while (this.pos < this.expr.length && '+-'.includes(this.expr[this.pos])) {
            const op = this.expr[this.pos++];
            const right = this.parseTerm();
            left = op === '+' ? left.add(right) : left.sub(right);
        }
        return left;
    }
    parseTerm() {
        let left = this.parsePow();
        while (this.pos < this.expr.length && '*/'.includes(this.expr[this.pos])) {
            const op = this.expr[this.pos++];
            const right = this.parsePow();
            left = op === '*' ? left.mul(right) : left.div(right, 15);
        }
        return left;
    }
    parsePow() {
        let base = this.parseUnary();
        if (this.pos < this.expr.length && this.expr[this.pos] === '^') {
            this.pos++;
            const exp = this.parseUnary();
            return base.powFrac(exp, 20);
        }
        return base;
    }
    parseUnary() {
        if (this.pos < this.expr.length && this.expr[this.pos] === '-') { this.pos++; return this.parsePrimary().neg(); }
        if (this.pos < this.expr.length && this.expr[this.pos] === '+') { this.pos++; }
        return this.parsePrimary();
    }
    parsePrimary() {
        if (this.pos >= this.expr.length) throw new Error('Unexpected end');
        const ch = this.expr[this.pos];
        if ((ch >= '0' && ch <= '9') || ch === '.') return this.parseNum();
        if (ch === '(') {
            this.pos++;
            const r = this.parseExpr();
            if (this.pos < this.expr.length && this.expr[this.pos] === ')') this.pos++;
            return r;
        }
        // Functions and constants
        const rem = this.expr.slice(this.pos).toLowerCase();
        const fns = ['factorial','sqrt','cbrt','sin','cos','tan','asin','acos','atan',
                      'sinh','cosh','tanh','exp','log','ln','log10','abs','ceil','floor',
                      'zeta','erf','erfc','gamma','doublefactorial','bernoulli','fibonacci',
                      'besselj0','besselj1','lambertw','li','ei','sigmoid'];
        for (const fn of fns) {
            if (rem.startsWith(fn)) {
                this.pos += fn.length;
                if (this.pos >= this.expr.length || this.expr[this.pos] !== '(') throw new Error('Expected (' + fn);
                this.pos++;
                const args = [this.parseExpr()];
                while (this.pos < this.expr.length && this.expr[this.pos] === ',') { this.pos++; args.push(this.parseExpr()); }
                if (this.pos < this.expr.length && this.expr[this.pos] === ')') this.pos++;
                return this.callFn(fn, args);
            }
        }
        if (rem.startsWith('pi')) { this.pos += 2; return AP.PI(this.p); }
        if (rem.startsWith('e') && (this.pos + 1 >= this.expr.length || !/[a-zA-Z]/.test(this.expr[this.pos + 1]))) {
            this.pos++; return AP.E(this.p);
        }
        throw new Error('Unexpected char at ' + this.pos + ': ' + this.expr[this.pos]);
    }
    parseNum() {
        let start = this.pos;
        while (this.pos < this.expr.length && /[0-9.eE]/.test(this.expr[this.pos]) ||
               (this.expr[this.pos] === '-' && 'eE'.includes(this.expr[this.pos - 1]))) this.pos++;
        return AP.from(this.expr.slice(start, this.pos), this.p);
    }
    callFn(name, args) {
        const p = this.p;
        const x = args[0];
        switch (name) {
            case 'sqrt': return x.sqrt();
            case 'cbrt': { // Newton's method for cube root
                let r = x.clone(); r.precision = p + 20;
                for (let i = 0; i < (p + 20) * 4; i++) {
                    const r2 = r.mul(r), r3 = r2.mul(r);
                    const rn = r.mul(new AP(2n)).add(x.div(r2, 15)).div(new AP(3n), 15);
                    if (rn.sub(r).abs().lt(AP.from('1e-' + String(p + 20), p + 20))) break;
                    r = rn;
                }
                return r._trim(p);
            }
            case 'abs': return x.abs();
            case 'floor': { const s = x.toString(); if (!s.includes('.')) return x.clone(); const i = s.split('.')[0]; return AP.from(i, p); }
            case 'ceil': { const s = x.toString(); if (!s.includes('.')) return x.clone(); const [i, f] = s.split('.'); return f && parseInt(f) > 0 ? AP.from(String(BigInt(i) + 1n), p) : AP.from(i, p); }
            case 'sin': return _apSin(x, 30);
            case 'cos': return _apCos(x, 30);
            case 'tan': return _apTan(x, 30);
            case 'asin': return _apASin(x, 30);
            case 'acos': return _apPI(p).div(new AP(2n)).sub(_apASin(x, 30));
            case 'atan': return _apAtan(x, 30);
            case 'sinh': { const e = _apExp(x, 30); return e.sub(_apExp(x.neg(), 30)).div(new AP(2n), 15); }
            case 'cosh': { const e = _apExp(x, 30); return e.add(_apExp(x.neg(), 30)).div(new AP(2n), 15); }
            case 'tanh': { const e2 = _apExp(x.mul(new AP(2n)), 30); return e2.sub(AP.one(p)).div(e2.add(AP.one(p)), 15); }
            case 'exp': return _apExp(x, 30);
            case 'log': case 'ln': return _apLn(x, 30);
            case 'log10': return _apLn(x, 30).div(_apLn(AP.from(10, p + 30), 30), 15);
            case 'factorial': return _apGamma(x.add(AP.one(p)), 30);
            case 'gamma': return _apGamma(x, 30);
            case 'zeta': return _apZeta(x, 30);
            case 'erf': return _apErf(x, 30);
            case 'erfc': return AP.one(p).sub(_apErf(x, 30));
            case 'besselj0': { // series
                const x2d4 = x.mul(x).div(new AP(4n), 20);
                let term = AP.one(p + 30), sum = AP.one(p + 30);
                const eps = AP.from('1e-' + String(p + 30), p + 30);
                for (let k = 1; k < p * 6; k++) { term = term.mul(x2d4).div(new AP(BigInt(k * k)), 20); sum = k % 2 === 0 ? sum.add(term) : sum.sub(term); if (term.abs().lt(eps)) break; }
                return sum._trim(p);
            }
            case 'besselj1': {
                const x2d4 = x.mul(x).div(new AP(4n), 20);
                let term = x.div(new AP(2n), 20), sum = term.clone();
                const eps = AP.from('1e-' + String(p + 30), p + 30);
                for (let k = 1; k < p * 6; k++) { term = term.mul(x2d4).div(new AP(BigInt(k * (k + 1))), 20); sum = k % 2 === 0 ? sum.add(term) : sum.sub(term); if (term.abs().lt(eps)) break; }
                return sum._trim(p);
            }
            case 'lambertw': { // Newton for W*e^W = x
                let w = new AP('0.5'); w.precision = p + 30;
                for (let i = 0; i < 200; i++) {
                    const ew = _apExp(w, 30);
                    const fw = w.mul(ew).sub(x);
                    const dfw = ew.mul(w.add(AP.one(p + 30)));
                    w = w.sub(fw.div(dfw, 15));
                }
                return w._trim(p);
            }
            case 'li': { // integral li(x) via midpoint
                let sum = AP.zero(p + 30);
                const a = AP.from('0.001', p + 30);
                const n = 200;
                const h = x.sub(a).div(new AP(BigInt(n)), 20);
                for (let i = 0; i < n; i++) { const t = a.add(h.mul(new AP(BigInt(i)))); if (t.lte(AP.one(p))) continue; sum = sum.add(h.div(_apLn(t, 20), 20)); }
                return sum._trim(p);
            }
            case 'ei': { // Ei(x) = gamma + ln|x| + sum x^k/(k*k!)
                const euler = AP.from('0.57721566490153286060651209008240243104215933593992', p + 30);
                let result = euler.add(_apLn(x.abs(), 30));
                let term = x.clone(); const eps = AP.from('1e-' + String(p + 30), p + 30);
                for (let k = 1; k < 200; k++) { result = result.add(term.div(new AP(BigInt(k) * _factBig(k)), 15)); term = term.mul(x); if (term.abs().lt(eps)) break; }
                return result._trim(p);
            }
            case 'doublefactorial': { let n = Math.floor(x.toNumber()); let r = AP.one(p); while (n > 0) { r = r.mul(new AP(BigInt(n))); n -= 2; } return r; }
            case 'bernoulli': { const n = Math.floor(x.toNumber()); return _bernoulli(n, p); }
            case 'fibonacci': { const n = Math.floor(x.toNumber()); let a = AP.zero(p), b = AP.one(p); for (let i = 2; i <= n; i++) { const c = a.add(b); a = b; b = c; } return b; }
            case 'sigmoid': return _apSigmoid(x, args[1], args[2], args[3], p);
            default: throw new Error('Unknown: ' + name);
        }
    }
}

function _bernoulli(n, p) {
    if (n < 0) return AP.zero(p);
    if (n === 0) return AP.one(p);
    if (n === 1) return AP.from('-0.5', p);
    if (n % 2 === 1 && n > 1) return AP.zero(p);
    const B = [AP.one(p)];
    for (let m = 1; m <= n; m++) {
        B[m] = AP.zero(p);
        for (let k = 0; k < m; k++) B[m] = B[m].sub(AP.from(_binom(m + 1, k), p).mul(B[k]));
        B[m] = B[m].div(new AP(BigInt(m + 1)), 15);
    }
    return B[n];
}

// ============================================================
// UI Helpers
// ============================================================

function show(id, text, err) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.style.display = 'block';
    el.className = 'result-box ' + (err ? 'error' : 'success');
}

function insert(t) { const i = document.getElementById('calc-expr'); i.value += t; i.focus(); }
function setExpr(t) { document.getElementById('calc-expr').value = t; evaluate(); }
function setPrec(v) { document.getElementById('calc-precision').value = v; }

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(btn.dataset.tab).classList.add('active');
        btn.classList.add('active');
    });
});

// Enter key on calc input
document.getElementById('calc-expr').addEventListener('keydown', e => { if (e.key === 'Enter') evaluate(); });

// ============================================================
// Calculator
// ============================================================

function evaluate() {
    try {
        const expr = document.getElementById('calc-expr').value;
        const p = parseInt(document.getElementById('calc-precision').value) || 50;
        const result = new Parser(expr, p).parse();
        show('calc-result', result.toString());
    } catch (e) { show('calc-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Number Theory
// ============================================================

function computeNumFunc() {
    try {
        const fn = document.getElementById('nf-sel').value;
        const parts = document.getElementById('nf-in').value.split(',').map(s => s.trim());
        const p = 50;
        let result;
        switch (fn) {
            case 'factorial': {
                const n = parseInt(parts[0]); result = AP.one(p);
                for (let i = 2; i <= n; i++) result = result.mul(new AP(BigInt(i)));
                break;
            }
            case 'fibonacci': {
                const n = parseInt(parts[0]); let a = AP.zero(p), b = AP.one(p);
                for (let i = 2; i <= n; i++) { const c = a.add(b); a = b; b = c; }
                result = b; break;
            }
            case 'gcd': { let a = BigInt(parts[0]), b = BigInt(parts[1]); result = AP.from(String(_gcd(a, b)), p); break; }
            case 'lcm': { let a = BigInt(parts[0]), b = BigInt(parts[1]); result = AP.from(String(a * b / _gcd(a, b)), p); break; }
            case 'isprime': { result = AP.from(_isPrime(BigInt(parts[0])) ? '1' : '0', p); break; }
            case 'primepi': { const n = parseInt(parts[0]); let c = 0; for (let i = 2; i <= n; i++) if (_isPrime(BigInt(i))) c++; result = new AP(BigInt(c)); break; }
            case 'eulerphi': {
                let n = parseInt(parts[0]), r = n;
                for (let pp = 2; pp * pp <= n; pp++) { if (n % pp === 0) { while (n % pp === 0) n /= pp; r -= r / pp; } }
                if (n > 1) r -= r / n;
                result = new AP(BigInt(r)); break;
            }
            case 'divisors': {
                const n = parseInt(parts[0]); const d = [];
                for (let i = 1; i * i <= n; i++) { if (n % i === 0) { d.push(i); if (i !== n / i) d.push(n / i); } }
                d.sort((a, b) => a - b);
                show('nf-result', `Divisors of ${n}: ${d.join(', ')}\nCount: ${d.length}`); return;
            }
            default: result = AP.zero(p);
        }
        show('nf-result', result.toString());
    } catch (e) { show('nf-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Special Functions
// ============================================================

function computeSpecFunc() {
    try {
        const fn = document.getElementById('sf-sel').value;
        const x = AP.from(document.getElementById('sf-in').value.trim(), 80);
        const p = 50;
        let result;
        switch (fn) {
            case 'gamma': result = _apGamma(x, 30); break;
            case 'erf': result = _apErf(x, 30); break;
            case 'erfc': result = AP.one(p + 30).sub(_apErf(x, 30)); break;
            case 'zeta': result = _apZeta(x, 30); break;
            case 'besselj0': {
                const x2d4 = x.mul(x).div(new AP(4n), 20); let term = AP.one(p + 30), sum = AP.one(p + 30);
                const eps = AP.from('1e-' + String(p + 30), p + 30);
                for (let k = 1; k < 300; k++) { term = term.mul(x2d4).div(new AP(BigInt(k * k)), 20); sum = k % 2 === 0 ? sum.add(term) : sum.sub(term); if (term.abs().lt(eps)) break; }
                result = sum; break;
            }
            case 'besselj1': {
                const x2d4 = x.mul(x).div(new AP(4n), 20); let term = x.div(new AP(2n), 20), sum = term.clone();
                const eps = AP.from('1e-' + String(p + 30), p + 30);
                for (let k = 1; k < 300; k++) { term = term.mul(x2d4).div(new AP(BigInt(k * (k + 1))), 20); sum = k % 2 === 0 ? sum.add(term) : sum.sub(term); if (term.abs().lt(eps)) break; }
                result = sum; break;
            }
            case 'lambertw': {
                let w = new AP('0.5'); w.precision = 80;
                for (let i = 0; i < 200; i++) { const ew = _apExp(w, 30); const fw = w.mul(ew).sub(x); const dfw = ew.mul(w.add(AP.one(80))); w = w.sub(fw.div(dfw, 15)); }
                result = w; break;
            }
            case 'li': {
                let sum = AP.zero(80); const a = AP.from('0.001', 80); const n = 500;
                const h = x.sub(a).div(new AP(BigInt(n)), 20);
                for (let i = 0; i < n; i++) { const t = a.add(h.mul(new AP(BigInt(i)))); if (t.lte(AP.one(80))) continue; sum = sum.add(h.div(_apLn(t, 20), 20)); }
                result = sum; break;
            }
            case 'ei': {
                const euler = AP.from('0.57721566490153286060651209008240243104215933593992', 80);
                let r = euler.add(_apLn(x.abs(), 30)); let term = x.clone();
                for (let k = 1; k < 200; k++) { r = r.add(term.div(new AP(BigInt(k) * _factBig(k)), 15)); term = term.mul(x); }
                result = r; break;
            }
            default: result = AP.zero(p);
        }
        show('sf-result', result.toString());
    } catch (e) { show('sf-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Combinatorics
// ============================================================

function computeCombo() {
    try {
        const fn = document.getElementById('cb-sel').value;
        const parts = document.getElementById('cb-in').value.split(',').map(s => parseInt(s.trim()));
        const p = 50; let result;
        switch (fn) {
            case 'perm': { const [n, k] = parts; result = AP.one(p); for (let i = n - k + 1; i <= n; i++) result = result.mul(new AP(BigInt(i))); break; }
            case 'comb': { const [n, k] = parts; result = AP.one(p); for (let i = 0; i < k; i++) result = result.mul(new AP(BigInt(n - i))).div(new AP(BigInt(i + 1)), 15); break; }
            case 'bell': {
                const n = parts[0]; const B = [AP.one(p)];
                for (let m = 1; m <= n; m++) { B[m] = AP.zero(p); for (let k = 0; k < m; k++) B[m] = B[m].add(AP.from(_binom(m - 1, k), p).mul(B[k])); }
                result = B[n]; break;
            }
            case 'catalan': { const n = parts[0]; result = AP.from(_binom(2 * n, n), p).div(new AP(BigInt(n + 1)), 15); break; }
            default: result = AP.zero(p);
        }
        show('cb-result', result.toString());
    } catch (e) { show('cb-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Conversions
// ============================================================

function computeConv() {
    try {
        const fn = document.getElementById('cv-sel').value;
        const input = document.getElementById('cv-in').value.trim();
        const p = 50;
        switch (fn) {
            case 'frac': {
                const x = AP.from(input, p); const val = x.toNumber();
                let bestN = BigInt(Math.round(val)), bestD = 1n, bestErr = Math.abs(val - Number(bestN));
                for (let d = 2; d <= 1000000; d++) {
                    const n = Math.round(val * d);
                    const err = Math.abs(val - n / d);
                    if (err < bestErr) { bestErr = err; bestN = BigInt(n); bestD = BigInt(d); }
                    if (bestErr < 1e-15) break;
                }
                show('cv-result', `${bestN}/${bestD}\n= ${AP.from(bestN.toString(), p).div(AP.from(bestD.toString(), p), 15).toString()}`);
                break;
            }
            case 'cf': {
                const x = AP.from(input, p); let val = x.toNumber(); const cf = [];
                for (let i = 0; i < 20; i++) { const a = Math.floor(val); cf.push(a); val -= a; if (Math.abs(val) < 1e-15) break; val = 1 / val; }
                show('cv-result', cf.join(', '));
                break;
            }
            case 'hex': { const n = Math.round(AP.from(input, p).toNumber()); show('cv-result', '0x' + n.toString(16).toUpperCase()); break; }
            case 'bin': { const n = Math.round(AP.from(input, p).toNumber()); show('cv-result', '0b' + n.toString(2)); break; }
        }
    } catch (e) { show('cv-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Derivative
// ============================================================

function evalAt(expr, xVal, prec) {
    const p = prec || 100;
    const pp = new Parser(expr, p);
    pp.expr = pp.expr.replace(/\bx\b/g, '(' + xVal + ')');
    pp.pos = 0;
    return pp.parse();
}

function computeDeriv() {
    try {
        const expr = document.getElementById('df-fn').value;
        const x0 = AP.from(document.getElementById('df-pt').value, 100);
        const order = parseInt(document.getElementById('df-ord').value);
        const h = AP.from('1e-8', 50);
        let result;
        if (order === 1) {
            result = evalAt(expr, x0.add(h).toString()).sub(evalAt(expr, x0.sub(h).toString())).div(h.mul(new AP(2n)), 15);
        } else if (order === 2) {
            const fp = evalAt(expr, x0.add(h).toString());
            const fm = evalAt(expr, x0.sub(h).toString());
            const f0 = evalAt(expr, x0.toString());
            result = fp.sub(f0.mul(new AP(2n))).add(fm).div(h.mul(h), 15);
        } else {
            // Higher order via recursive central differences
            const vals = [];
            for (let i = -order; i <= order; i++) vals.push(evalAt(expr, x0.add(h.mul(new AP(BigInt(i)))).toString()));
            let coeffs = new Array(2 * order + 1).fill(0);
            coeffs[order] = 1;
            for (let iter = 0; iter < order; iter++) {
                const nc = new Array(2 * order + 1).fill(0);
                for (let i = 0; i < 2 * order; i++) { nc[i] += coeffs[i]; nc[i + 1] -= coeffs[i]; }
                coeffs = nc;
            }
            let sum = AP.zero(100);
            for (let i = 0; i < coeffs.length; i++) if (coeffs[i] !== 0) sum = sum.add(vals[i].mul(new AP(BigInt(coeffs[i]))));
            result = sum.div(h.powInt(order), 15);
        }
        show('df-result', `f${"'".repeat(order)}(${x0.toString()}) = ${result.toString()}`);
    } catch (e) { show('df-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Integration
// ============================================================

function gaussLegendreNodes(n) {
    const nodes = [];
    for (let i = 0; i < n; i++) {
        let x = Math.cos(Math.PI * (4 * i + 3) / (4 * n + 2));
        for (let iter = 0; iter < 100; iter++) {
            let [p0, p1] = [1, x];
            for (let k = 1; k < n; k++) { const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1); p0 = p1; p1 = p2; }
            let [dp0, dp1] = [0, 1];
            for (let k = 1; k < n; k++) { const dp2 = ((2 * k + 1) * (p1 + x * dp1) - k * dp0) / (k + 1); dp0 = dp1; dp1 = dp2; }
            x -= p1 / dp1;
        }
        let [p0, p1] = [1, x];
        for (let k = 1; k < n; k++) { const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1); p0 = p1; p1 = p2; }
        let [dp0, dp1] = [0, 1];
        for (let k = 1; k < n; k++) { const dp2 = ((2 * k + 1) * (p1 + x * dp1) - k * dp0) / (k + 1); dp0 = dp1; dp1 = dp2; }
        const w = 2 / ((1 - x * x) * dp1 * dp1);
        nodes.push([x, w]);
    }
    return nodes;
}

function computeIntegral() {
    try {
        const expr = document.getElementById('ig-fn').value;
        const a = AP.from(document.getElementById('ig-lo').value, 100);
        const b = AP.from(document.getElementById('ig-hi').value, 100);
        const meth = document.getElementById('ig-meth').value;
        const n = parseInt(document.getElementById('ig-pts').value);
        const p = 50;
        let result;
        if (meth === 'gauss') {
            const nodes = gaussLegendreNodes(n);
            const mid = a.add(b).div(new AP(2n), 20);
            const half = b.sub(a).div(new AP(2n), 20);
            result = AP.zero(100);
            for (const [xi, wi] of nodes) {
                const x = mid.add(half.mul(AP.from(xi, 100)));
                const fx = evalAt(expr, x.toString());
                result = result.add(fx.mul(AP.from(wi, 100)));
            }
            result = result.mul(half);
        } else if (meth === 'simpson') {
            // Adaptive Simpson
            const fa = evalAt(expr, a.toString()), fb = evalAt(expr, b.toString());
            const mid = a.add(b).div(new AP(2n), 20);
            const fm = evalAt(expr, mid.toString());
            const S = fa.add(fm.mul(new AP(4n)).add(fb)).mul(b.sub(a)).div(new AP(6n));
            result = _simpsonAdaptive(expr, a, b, fa, fb, fm, S, 100, 1);
        } else {
            // Romberg
            const R = [];
            const h = b.sub(a);
            let row0 = evalAt(expr, a.toString()).add(evalAt(expr, b.toString())).mul(h).div(new AP(2n));
            R.push([row0]);
            for (let i = 1; i <= Math.min(n, 20); i++) {
                const hi = h.div(new AP(BigInt(1 << i)), 20);
                let sum = AP.zero(100);
                const steps = 1 << (i - 1);
                for (let j = 1; j <= steps; j++) sum = sum.add(evalAt(expr, a.add(new AP(BigInt(2 * j - 1)).mul(hi)).toString()));
                const row = [R[i - 1][0].div(new AP(2n)).add(sum.mul(hi))];
                for (let j = 1; j <= i; j++) row.push(row[j - 1].add(row[j - 1].sub(R[i - 1][j - 1]).div(new AP(BigInt((1 << (2 * j)) - 1)))));
                R.push(row);
            }
            result = R[R.length - 1][R[R.length - 1].length - 1];
        }
        show('ig-result', `∫ ${expr} dx from ${a.toString()} to ${b.toString()}\n= ${result.toString()}`);
    } catch (e) { show('ig-result', 'Error: ' + e.message, true); }
}

function _simpsonAdaptive(expr, a, b, fa, fb, fm, S, prec, depth) {
    if (depth > 18) return S;
    const mid = a.add(b).div(new AP(2n), 20);
    const q1 = a.add(mid).div(new AP(2n), 20);
    const q2 = mid.add(b).div(new AP(2n), 20);
    const fq1 = evalAt(expr, q1.toString());
    const fq2 = evalAt(expr, q2.toString());
    const S1 = fa.add(fq1.mul(new AP(4n)).add(fm)).mul(mid.sub(a)).div(new AP(6n));
    const S2 = fm.add(fq2.mul(new AP(4n)).add(fb)).mul(b.sub(mid)).div(new AP(6n));
    const Snew = S1.add(S2);
    const err = Snew.sub(S).abs().div(new AP(15n));
    if (err.lt(AP.from('1e-' + String(Math.min(prec, 40)), prec)) || depth > 15) return Snew.add(Snew.sub(S).div(new AP(15n)));
    return _simpsonAdaptive(expr, a, mid, fa, fm, fq1, S1, prec, depth + 1)
        .add(_simpsonAdaptive(expr, mid, b, fm, fb, fq2, S2, prec, depth + 1));
}

// ============================================================
// ODE Solver (RK4)
// ============================================================

function solveODE() {
    try {
        const expr = document.getElementById('ode-fn').value;
        const x0 = AP.from(document.getElementById('ode-x0').value, 100);
        const y0 = AP.from(document.getElementById('ode-y0').value, 100);
        const xEnd = AP.from(document.getElementById('ode-end').value, 100);
        const steps = parseInt(document.getElementById('ode-steps').value);
        const h = xEnd.sub(x0).div(new AP(BigInt(steps)), 20);
        let x = x0.clone(), y = y0.clone();
        const results = [{ x: x.toString(), y: y.toString() }];
        for (let i = 0; i < steps; i++) {
            const evalF = (xv, yv) => {
                const p = new Parser(expr, 100);
                p.expr = p.expr.replace(/x/g, '(' + xv + ')').replace(/y/g, '(' + yv + ')');
                p.pos = 0; return p.parse();
            };
            const k1 = evalF(x, y);
            const k2 = evalF(x.add(h.div(new AP(2n), 15)), y.add(k1.mul(h).div(new AP(2n), 15)));
            const k3 = evalF(x.add(h.div(new AP(2n), 15)), y.add(k2.mul(h).div(new AP(2n), 15)));
            const k4 = evalF(x.add(h), y.add(k3.mul(h)));
            y = y.add(h.div(new AP(6n), 15).mul(k1.add(k2.mul(new AP(2n))).add(k3.mul(new AP(2n))).add(k4)));
            x = x.add(h);
            results.push({ x: x.toString(), y: y.toString() });
        }
        let out = `x\t\ty\n${'─'.repeat(40)}\n`;
        const step = Math.max(1, Math.floor(results.length / 30));
        for (let i = 0; i < results.length; i += step) out += `${results[i].x}\t${results[i].y}\n`;
        out += `\nFinal: y(${xEnd.toString()}) = ${results[results.length - 1].y}`;
        show('ode-result', out);
    } catch (e) { show('ode-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Taylor Series
// ============================================================

function computeTaylor() {
    try {
        const expr = document.getElementById('tl-fn').value;
        const a = AP.from(document.getElementById('tl-pt').value, 100);
        const numTerms = parseInt(document.getElementById('tl-n').value);
        const p = 50;
        const h = AP.from('1e-7', 30);
        const evalAt2 = (xv) => { const pp = new Parser(expr, 100); pp.expr = pp.expr.replace(/x/g, '(' + xv + ')'); pp.pos = 0; return pp.parse(); };
        const coeffs = [];
        for (let k = 0; k < numTerms; k++) {
            let deriv = AP.zero(100);
            const N = Math.min(k + 5, 15);
            for (let i = 0; i < N; i++) {
                const sh = h.mul(new AP(BigInt(i + 1)));
                deriv = deriv.add(evalAt2(a.add(sh).toString()).sub(evalAt2(a.sub(sh).toString())));
            }
            deriv = deriv.div(h.mul(new AP(BigInt(2 * N))));
            // Divide by k! for Taylor coefficient
            if (k > 0) {
                const factK = new AP(_factBig(k));
                deriv = deriv.div(factK, 15);
            }
            coeffs.push(deriv);
        }
        let out = `Taylor series of ${expr} around x = ${a.toString()}:\n\nf(x) ≈ `;
        const terms = [];
        for (let k = 0; k < numTerms; k++) {
            if (coeffs[k].isZero()) continue;
            const coef = coeffs[k].toString();
            const xPart = a.isZero() ? (k === 0 ? '' : k === 1 ? 'x' : `x^${k}`) : (k === 0 ? '' : k === 1 ? `(x-${a})` : `(x-${a})^${k}`);
            terms.push(k === 0 ? coef : `${coef}·${xPart}`);
        }
        out += terms.join(' + ') + '\n\nCoefficients:\n';
        for (let k = 0; k < numTerms; k++) out += `  a_${k} = ${coeffs[k].toString()}\n`;
        show('tl-result', out);
    } catch (e) { show('tl-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Root Finding
// ============================================================

function findRoot() {
    try {
        const expr = document.getElementById('rf-fn').value;
        const method = document.getElementById('rf-meth').value;
        const x0 = AP.from(document.getElementById('rf-x0').value, 100);
        const x1s = document.getElementById('rf-x1').value;
        const tol = AP.from(document.getElementById('rf-tol').value, 100);
        const maxIter = parseInt(document.getElementById('rf-mi').value);
        const p = 50;
        const evalF = (x) => { const pp = new Parser(expr, 100); pp.expr = pp.expr.replace(/x/g, '(' + x + ')'); pp.pos = 0; return pp.parse(); };
        let root, iter = 0;

        if (method === 'newton') {
            let x = x0.clone();
            for (let i = 0; i < maxIter; i++) {
                const fx = evalF(x);
                const h = AP.from('1e-10', 50);
                const fpx = evalF(x.add(h)).sub(evalF(x.sub(h))).div(h.mul(new AP(2n)), 15);
                const xn = x.sub(fx.div(fpx, 20));
                iter++;
                if (xn.sub(x).abs().lt(tol)) { root = xn; break; }
                x = xn; root = x;
            }
        } else if (method === 'bisection') {
            let a = x0.clone(), b = x1s ? AP.from(x1s, 100) : x0.add(AP.from('1', 100));
            if (evalF(a).isPos()) [a, b] = [b, a];
            for (let i = 0; i < maxIter; i++) {
                const mid = a.add(b).div(new AP(2n), 20);
                const fm = evalF(mid); iter++;
                if (fm.abs().lt(tol) || b.sub(a).abs().lt(tol)) { root = mid; break; }
                if (fm.isNeg()) a = mid; else b = mid;
                root = mid;
            }
        } else { // secant
            let x0v = x0.clone(), x1v = x1s ? AP.from(x1s, 100) : x0.add(AP.from('1', 100));
            let f0 = evalF(x0v), f1 = evalF(x1v);
            for (let i = 0; i < maxIter; i++) {
                const xn = x1v.sub(f1.mul(x1v.sub(x0v)).div(f1.sub(f0), 20));
                iter++;
                if (xn.sub(x1v).abs().lt(tol)) { root = xn; break; }
                x0v = x1v; f0 = f1; x1v = xn; f1 = evalF(xn); root = xn;
            }
        }
        const fx = evalF(root);
        show('rf-result', `Root: ${root.toString()}\nf(root) = ${fx.toString()}\nMethod: ${method}\nIterations: ${iter}`);
    } catch (e) { show('rf-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Plotter
// ============================================================

let _plotChart = null;

function _lambertwPlot(x) {
    let w = x >= 0 ? 0.5 : -0.5;
    for (let i = 0; i < 50; i++) {
        const ew = Math.exp(w);
        const fw = w * ew - x;
        const dfw = ew * (w + 1);
        w -= fw / dfw;
    }
    return w;
}

function _sigmoidPlot(x, curve) {
    curve = (curve || 'logistic').toLowerCase();
    const lo = 0, hi = 1;
    let raw;
    switch (curve) {
        case 'logistic': case 'lg':
            raw = x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
            break;
        case 'tanh': case 'th':
            raw = (Math.tanh(x) + 1) / 2;
            break;
        case 'softsign': case 'ss':
            raw = (x / (1 + Math.abs(x)) + 1) / 2;
            break;
        case 'arctan': case 'at':
            raw = (Math.atan(x) * 2 / Math.PI + 1) / 2;
            break;
        case 'algebraic': case 'al':
            raw = (x / Math.sqrt(1 + x * x) + 1) / 2;
            break;
        case 'hard': case 'hr':
            if (x > 1) raw = 1; else if (x < -1) raw = 0; else raw = (x + 1) / 2;
            break;
        case 'erf': case 'er':
            raw = (erfPlot(x) + 1) / 2;
            break;
        case 'sqrt': case 'rt':
            raw = (x / (Math.sqrt(x * x + 1) + 1) + 1) / 2;
            break;
        case 'quartic': case 'qr':
            raw = (x / Math.sqrt(1 + x * x * x * x) + 1) / 2;
            break;
        case 'exponential': case 'ex':
            raw = (Math.sign(x) * (1 - Math.exp(-Math.abs(x))) + 1) / 2;
            break;
        case 'smoothstep': case 's3': {
            const t = (x + 1) / 2;
            raw = 3 * t * t - 2 * t * t * t;
            break;
        }
        case 'smootherstep': case 's5': {
            const t = (x + 1) / 2;
            raw = 6 * Math.pow(t, 5) - 15 * Math.pow(t, 4) + 10 * t * t * t;
            break;
        }
        case 'smooth+': case 's+': {
            raw = x / (1 + Math.log(1 + Math.exp(Math.sqrt(1 + x * x))));
            raw = (raw + 1) / 2;
            break;
        }
        default: throw new Error('Unknown sigmoid curve: ' + curve);
    }
    return lo + (hi - lo) * raw;
}

function erfPlot(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}

function _plotEval(expr, x) {
    let s = expr.replace(/\bx\b/g, '(' + x + ')');
    s = s.replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos').replace(/\btan\b/g, 'Math.tan');
    s = s.replace(/\basin\b/g, 'Math.asin').replace(/\bacos\b/g, 'Math.acos').replace(/\batan\b/g, 'Math.atan');
    s = s.replace(/\bsinh\b/g, 'Math.sinh').replace(/\bcosh\b/g, 'Math.cosh').replace(/\btanh\b/g, 'Math.tanh');
    s = s.replace(/\bexp\b/g, 'Math.exp').replace(/\blog\b/g, 'Math.log').replace(/\bln\b/g, 'Math.log');
    s = s.replace(/\blog10\b/g, 'Math.log10').replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\bcbrt\b/g, 'Math.cbrt');
    s = s.replace(/\babs\b/g, 'Math.abs').replace(/\bceil\b/g, 'Math.ceil').replace(/\bfloor\b/g, 'Math.floor');
    s = s.replace(/\blambertw\b/g, '_lambertwPlot');
    s = s.replace(/\bsigmoid\b/g, '_sigmoidPlot');
    s = s.replace(/\bpi\b/g, 'Math.PI').replace(/\be\b(?![a-z])/g, 'Math.E');
    s = s.replace(/\^/g, '**');
    return Function('"use strict"; return (' + s + ')')();
}

function doPlot() {
    try {
        const fns = document.getElementById('pt-fn').value.split('\n').filter(f => f.trim());
        const xMin = parseFloat(document.getElementById('pt-xmin').value);
        const xMax = parseFloat(document.getElementById('pt-xmax').value);
        const N = parseInt(document.getElementById('pt-n').value);
        const colors = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899'];
        const xVals = Array.from({length: N}, (_, i) => xMin + (xMax - xMin) * i / (N - 1));
        const datasets = [];
        let yMin = Infinity, yMax = -Infinity;
        fns.forEach((fn, idx) => {
            const data = xVals.map(xv => {
                try { const y = _plotEval(fn, xv); return isFinite(y) ? { x: xv, y } : null; } catch { return null; }
            }).filter(Boolean);
            data.forEach(d => { if (d.y < yMin) yMin = d.y; if (d.y > yMax) yMax = d.y; });
            datasets.push({ label: fn, data, borderColor: colors[idx % colors.length], borderWidth: 2, pointRadius: 0, showLine: true, tension: 0.1 });
        });
        if (datasets.length === 0 || yMin === Infinity) { alert('No valid data points'); return; }
        const margin = (yMax - yMin) * 0.1 || 1;
        const ctx = document.getElementById('plotCanvas').getContext('2d');
        if (_plotChart) _plotChart.destroy();
        _plotChart = new Chart(ctx, {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true, animation: false,
                scales: {
                    x: { type: 'linear', min: xMin, max: xMax, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                    y: { min: yMin - margin, max: yMax + margin, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
                },
                plugins: { legend: { labels: { color: '#f1f5f9' } } }
            }
        });
    } catch (e) { alert('Plot error: ' + e.message); }
}

// ============================================================
// Series
// ============================================================

function computeSeries() {
    try {
        const term = document.getElementById('sr-term').value;
        const start = parseInt(document.getElementById('sr-start').value);
        const count = parseInt(document.getElementById('sr-count').value);
        const p = 50;
        let sum = AP.zero(p + 10);
        const previews = [];
        for (let n = start; n < start + count; n++) {
            const pp = new Parser(term, p + 10);
            pp.expr = pp.expr.replace(/n/g, '(' + n + ')'); pp.pos = 0;
            const t = pp.parse();
            sum = sum.add(t);
            if (previews.length < 8) previews.push(`a(${n}) = ${t.toString()}`);
        }
        show('sr-result', `Partial sum (${count} terms): ${sum.toString()}\n\nFirst terms:\n${previews.join('\n')}`);
    } catch (e) { show('sr-result', 'Error: ' + e.message, true); }
}

function computePiDigits() {
    const d = parseInt(document.getElementById('pi-d').value);
    try { show('pi-result', `π to ${d} digits:\n\n${AP.PI(d + 20).toFixed(d)}`); } catch (e) { show('pi-result', 'Error: ' + e.message, true); }
}

function computeEDigits() {
    const d = parseInt(document.getElementById('e-d').value);
    try { show('e-result', `e to ${d} digits:\n\n${AP.E(d + 20).toFixed(d)}`); } catch (e) { show('e-result', 'Error: ' + e.message, true); }
}

function computeFib() {
    const n = parseInt(document.getElementById('fib-n').value);
    try {
        const p = 50; let a = AP.zero(p), b = AP.one(p);
        for (let i = 2; i <= n; i++) { const c = a.add(b); a = b; b = c; }
        show('fib-result', `F(${n}) = ${b.toString()}`);
    } catch (e) { show('fib-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Linear Algebra
// ============================================================

function parseMat(txt) { return txt.trim().split('\n').map(r => r.trim().split(/\s+/).map(v => AP.from(v, 50))); }
function fmtMat(m) { return m.map(r => r.map(v => v.toString().padStart(14)).join(' ')).join('\n'); }

function computeMatrix() {
    try {
        const A = parseMat(document.getElementById('mx-a').value);
        const B = parseMat(document.getElementById('mx-b').value);
        const op = document.getElementById('mx-op').value;
        let result, out = '';
        switch (op) {
            case 'det': { result = matDet(A); out = `det(A) = ${result.toString()}`; break; }
            case 'inverse': { result = matInv(A); out = `A⁻¹ =\n${fmtMat(result)}`; break; }
            case 'transpose': { result = matT(A); out = `Aᵀ =\n${fmtMat(result)}`; break; }
            case 'multiply': { result = matMul(A, B); out = `A × B =\n${fmtMat(result)}`; break; }
            case 'add': { result = A.map((r, i) => r.map((v, j) => v.add(B[i][j]))); out = `A + B =\n${fmtMat(result)}`; break; }
        }
        show('mx-result', out);
    } catch (e) { show('mx-result', 'Error: ' + e.message, true); }
}

function matDet(m) {
    const n = m.length;
    if (n === 1) return m[0][0];
    if (n === 2) return m[0][0].mul(m[1][1]).sub(m[0][1].mul(m[1][0]));
    let det = AP.zero(50);
    for (let j = 0; j < n; j++) {
        const minor = m.slice(1).map(r => r.filter((_, c) => c !== j));
        det = det.add(AP.from(j % 2 === 0 ? 1 : -1, 50).mul(m[0][j]).mul(matDet(minor)));
    }
    return det;
}

function matInv(m) {
    const n = m.length;
    const aug = m.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => AP.from(i === j ? 1 : 0, 50))]);
    for (let col = 0; col < n; col++) {
        let mx = col;
        for (let r = col + 1; r < n; r++) if (aug[r][col].abs().gt(aug[mx][col].abs())) mx = r;
        [aug[col], aug[mx]] = [aug[mx], aug[col]];
        const pv = aug[col][col];
        if (pv.isZero()) throw new Error('Singular matrix');
        for (let j = 0; j < 2 * n; j++) aug[col][j] = aug[col][j].div(pv, 15);
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = aug[r][col];
            for (let j = 0; j < 2 * n; j++) aug[r][j] = aug[r][j].sub(f.mul(aug[col][j]));
        }
    }
    return aug.map(r => r.slice(n));
}

function matT(m) { return m[0].map((_, j) => m.map(r => r[j])); }
function matMul(A, B) {
    return A.map((r, i) => B[0].map((_, j) => {
        let s = AP.zero(50); for (let k = 0; k < B.length; k++) s = s.add(A[i][k].mul(B[k][j])); return s;
    }));
}

function solveLinSys() {
    try {
        const A = parseMat(document.getElementById('ls-a').value);
        const b = parseMat(document.getElementById('ls-b').value).map(r => r[0]);
        const n = A.length;
        // Augmented matrix
        const aug = A.map((row, i) => [...row, b[i]]);
        for (let col = 0; col < n; col++) {
            let mx = col;
            for (let r = col + 1; r < n; r++) if (aug[r][col].abs().gt(aug[mx][col].abs())) mx = r;
            [aug[col], aug[mx]] = [aug[mx], aug[col]];
            const pv = aug[col][col];
            if (pv.isZero()) throw new Error('Singular');
            for (let j = col; j <= n; j++) aug[col][j] = aug[col][j].div(pv, 15);
            for (let r = 0; r < n; r++) {
                if (r === col) continue;
                const f = aug[r][col];
                for (let j = col; j <= n; j++) aug[r][j] = aug[r][j].sub(f.mul(aug[col][j]));
            }
        }
        const x = aug.map(r => r[n]);
        let out = 'Solution:\n' + x.map((v, i) => `x${i + 1} = ${v.toString()}`).join('\n');
        // Verify
        const prod = A.map((row, i) => row.reduce((s, v, j) => s.add(v.mul(x[j])), AP.zero(50)));
        out += '\n\nVerification (A·x):\n' + prod.map((v, i) => `[${v.toString()}] ≈ [${b[i].toString()}]`).join('\n');
        show('ls-result', out);
    } catch (e) { show('ls-result', 'Error: ' + e.message, true); }
}

// ============================================================
// Statistics
// ============================================================

function computeStats() {
    try {
        const raw = document.getElementById('st-data').value.split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
        const n = raw.length;
        const mean = raw.reduce((a, b) => a + b, 0) / n;
        const variance = raw.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
        const sorted = [...raw].sort((a, b) => a - b);
        const median = n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
        const min = sorted[0], max = sorted[n - 1];
        const range = max - min;
        const std = Math.sqrt(variance);
        const skewness = raw.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n;
        const kurtosis = raw.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / n - 3;
        const harmonic = n / raw.reduce((a, b) => a + 1 / b, 0);
        const geometric = Math.pow(raw.reduce((a, b) => a * b, 1), 1 / n);
        show('st-result', [
            `n = ${n}`,
            `Mean = ${mean}`,
            `Median = ${median}`,
            `Std Dev = ${std}`,
            `Variance = ${variance}`,
            `Min = ${min}`,
            `Max = ${max}`,
            `Range = ${range}`,
            `Skewness = ${skewness}`,
            `Excess Kurtosis = ${kurtosis}`,
            `Harmonic Mean = ${harmonic}`,
            `Geometric Mean = ${geometric}`,
            `Sum = ${raw.reduce((a, b) => a + b, 0)}`,
            `Sum of Squares = ${raw.reduce((a, b) => a + b * b, 0)}`
        ].join('\n'));
    } catch (e) { show('st-result', 'Error: ' + e.message, true); }
}
