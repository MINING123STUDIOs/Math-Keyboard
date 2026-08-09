// TM0 parser and execution engine

const BASE90_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ%^~|[]<>{}@#&*-+=()_\"':;/,` ";
const BASE90_MAP = {};
for (let i = 0; i < BASE90_DIGITS.length; i++) {
    BASE90_MAP[BASE90_DIGITS[i]] = i;
}

function decodeHex(h) {
    const val = parseInt(h, 16);
    return {
        wt: (val >> 3) & 1,
        wf: (val >> 2) & 1,
        dt: (val >> 1) & 1,
        df: val & 1,
    };
}

function decodeBase90(s) {
    let result = 0;
    for (let i = 0; i < s.length; i++) {
        result = result * 90 + BASE90_MAP[s[i]];
    }
    return result;
}

function parseLine(line) {
    // Only treat ';' as comment if at start of line
    if (line.trimStart().startsWith(";")) return null;
    if (!line.trim()) return null;

    const dotIdx = line.indexOf(".");
    if (dotIdx < 0) throw new Error(`missing '.' separator: ${line}`);

    const hChar = line[0];
    const stStr = line.substring(1, dotIdx);
    const sfStr = line.substring(dotIdx + 1);

    const h = decodeHex(hChar);
    const st = decodeBase90(stStr);
    const sf = decodeBase90(sfStr);

    return { wt: h.wt, wf: h.wf, dt: h.dt, df: h.df, st, sf };
}

function parseFile(text) {
    const lines = text.split("\n");
    const instructions = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        try {
            const instr = parseLine(line);
            if (instr) instructions.push(instr);
        } catch (e) {
            throw new Error(`error on line ${i + 1}: ${e.message}`);
        }
    }

    if (instructions.length === 0) {
        throw new Error("no instructions found");
    }

    return instructions;
}

const MAX_HISTORY = 1000;

class TM0Machine {
    constructor(instructions) {
        this.instructions = instructions;
        this.tape = new Map();
        this.head = 0;
        this.state = 1;
        this.halted = false;
        this.stepCount = 0;
        this.history = [];
        this.transitions = [];
        this._saveSnapshot();
    }

    readCell(pos) {
        return this.tape.get(pos) || 0;
    }

    writeCell(pos, val) {
        if (val === 0) {
            this.tape.delete(pos);
        } else {
            this.tape.set(pos, val);
        }
    }

    step() {
        if (this.halted) return false;

        const fromState = this.state;
        const instr = this.instructions[this.state - 1];
        const readVal = this.readCell(this.head);

        let writeVal, direction, nextState;
        if (readVal === 1) {
            writeVal = instr.wt;
            direction = instr.dt;
            nextState = instr.st;
        } else {
            writeVal = instr.wf;
            direction = instr.df;
            nextState = instr.sf;
        }

        this.writeCell(this.head, writeVal);
        this.head += direction === 1 ? 1 : -1;
        this.state = nextState;
        this.stepCount++;

        this.transitions.push({
            readValue: readVal,
            writeValue: writeVal,
            direction,
            fromState,
            toState: nextState,
        });

        if (this.state === 0) {
            this.halted = true;
        }

        if (this.history.length >= MAX_HISTORY) {
            this.history.shift();
        }
        this._saveSnapshot();

        return !this.halted;
    }

    _saveSnapshot() {
        this.history.push({
            tape: new Map(this.tape),
            head: this.head,
            state: this.state,
        });
    }

    reset() {
        this.tape = new Map();
        this.head = 0;
        this.state = 1;
        this.halted = false;
        this.stepCount = 0;
        this.history = [];
        this.transitions = [];
        this._saveSnapshot();
    }
}
