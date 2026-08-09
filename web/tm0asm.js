// TM0 Assembly Compiler
// Compiles human-readable assembly into TM0 instructions

function compileAssembly(source) {
    const lines = source.split("\n");
    const errors = [];
    const states = []; // { label, transitions: { 1: {...}, 0: {...} }, line }
    const labelMap = {}; // label -> 1-based state number

    let i = 0;
    while (i < lines.length) {
        const raw = lines[i];
        const line = raw.trim();
        i++;

        // skip empty lines and comments
        if (!line || line.startsWith(";")) continue;

        // Check for label prefix (standalone or inline)
        let label = null;
        let rest = line;
        const labelMatch = line.match(/^([a-zA-Z_]\w*):\s*(.*)$/);
        if (labelMatch) {
            label = labelMatch[1];
            rest = labelMatch[2].trim();
        }

        if (label) {
            if (labelMap[label] !== undefined) {
                errors.push({ line: i, message: `duplicate label "${label}"` });
                continue;
            }
            const transitions = {};
            const stateLine = i;

            // Parse inline transition if present
            if (rest && !rest.startsWith(";")) {
                const t = parseTransitionLine(rest, i, errors);
                if (t) {
                    handleTransition(t, transitions, label, i, errors);
                }
            }

            // Collect more transitions from subsequent lines (multi-line form)
            while (Object.keys(transitions).length < 2 && i < lines.length) {
                const inner = lines[i].trim();
                i++;

                if (inner === "" || inner.startsWith(";")) {
                    if (Object.keys(transitions).length === 2) break;
                    continue;
                }

                // Stop if we hit a new label
                if (inner.match(/^[a-zA-Z_]\w*:\s*/)) {
                    i--;
                    break;
                }

                const t = parseTransitionLine(inner, i, errors);
                if (t) {
                    handleTransition(t, transitions, label, i, errors);
                }
            }

            if (transitions[0] === undefined || transitions[1] === undefined) {
                errors.push({ line: stateLine, message: `state "${label}" missing transition (need both "on 0" and "on 1")` });
            }
            const stateNum = states.length + 1;
            labelMap[label] = stateNum;
            states.push({ label, transitions, line: stateLine });
            continue;
        }

        // if we're here, it might be a transition without a label (error)
        errors.push({ line: i, message: `unexpected line (expected label definition): "${line}"` });
    }

    // if there are errors, return early
    if (errors.length > 0) {
        return { instructions: null, errors };
    }

    // emit TM0 instructions
    const instructions = [];
    for (const state of states) {
        const t0 = state.transitions[0];
        const t1 = state.transitions[1];

        if (!t0 || !t1) {
            errors.push({ line: state.line, message: `state "${state.label}" incomplete` });
            continue;
        }

        const wt = t1.writeVal;
        const wf = t0.writeVal;
        const dt = t1.moveDir;
        const df = t0.moveDir;

        let st, sf;
        if (t1.gotoLabel === "halt") {
            st = 0;
        } else if (labelMap[t1.gotoLabel] !== undefined) {
            st = labelMap[t1.gotoLabel];
        } else {
            errors.push({ line: t1.line, message: `undefined label "${t1.gotoLabel}"` });
            st = 0;
        }
        if (t0.gotoLabel === "halt") {
            sf = 0;
        } else if (labelMap[t0.gotoLabel] !== undefined) {
            sf = labelMap[t0.gotoLabel];
        } else {
            errors.push({ line: t0.line, message: `undefined label "${t0.gotoLabel}"` });
            sf = 0;
        }

        instructions.push({ wt, wf, dt, df, st, sf });
    }

    if (errors.length > 0) {
        return { instructions: null, errors };
    }

    return { instructions, errors: [] };
}

function handleTransition(t, transitions, label, lineNum, errors) {
    if (t.readVal === "always") {
        // "always" expands to both on 0 and on 1 with identical behavior
        const base = { writeVal: t.writeVal, moveDir: t.moveDir, gotoLabel: t.gotoLabel, line: t.line };
        if (transitions[0] !== undefined) {
            errors.push({ line: lineNum, message: `duplicate "on 0" in state "${label}"` });
        }
        if (transitions[1] !== undefined) {
            errors.push({ line: lineNum, message: `duplicate "on 1" in state "${label}"` });
        }
        transitions[0] = { ...base, readVal: 0 };
        transitions[1] = { ...base, readVal: 1 };
    } else {
        if (transitions[t.readVal] !== undefined) {
            errors.push({ line: lineNum, message: `duplicate "on ${t.readVal}" in state "${label}"` });
        }
        transitions[t.readVal] = t;
    }
}

function parseTransitionLine(line, lineNum, errors) {
    // Expected formats:
    //   "on 1: write 1, move R, goto label"
    //   "on 0: write same, move L, goto halt"
    //   "always: write 1, move R, goto label"
    //   "1 -> 1, R, label"  (compact)
    //   "0 -> 0, R, halt"  (compact)

    let m, readVal, rest;

    m = line.match(/^on\s+([01])\s*:\s*(.+)$/);
    if (m) {
        readVal = parseInt(m[1]);
        rest = m[2].trim();
    } else if (m = line.match(/^always\s*:\s*(.+)$/)) {
        rest = m[1].trim();
        const t = parseTransitionBody(rest, lineNum, errors);
        if (!t) return null;
        return { readVal: "always", ...t, line: lineNum };
    } else {
        m = line.match(/^([01])\s*->\s*(.+)$/);
        if (m) {
            readVal = parseInt(m[1]);
            rest = m[2].trim();
        } else {
            errors.push({ line: lineNum, message: `invalid transition syntax: "${line}"` });
            return null;
        }
    }

    const t = parseTransitionBody(rest, lineNum, errors);
    if (!t) return null;
    return { readVal, ...t, line: lineNum };
}

function parseTransitionBody(body, lineNum, errors) {
    // Parse: "write V, move D, goto L"  (any order, partial allowed)
    let writeVal = null;
    let moveDir = null;
    let gotoLabel = null;

    // split by comma, but be careful with labels that might contain commas (they won't)
    const parts = body.split(",").map(s => s.trim());

    for (const part of parts) {
        let m;

        // write
        m = part.match(/^write\s+(same|0|1)$/i);
        if (m) {
            const v = m[1].toLowerCase();
            writeVal = v === "same" ? null : parseInt(v); // null = keep value (same)
            continue;
        }

        // move
        m = part.match(/^move\s+([LRlr])$/);
        if (m) {
            moveDir = m[1].toUpperCase() === "R" ? 1 : 0;
            continue;
        }

        // goto
        m = part.match(/^goto\s+([a-zA-Z_]\w*|halt)$/);
        if (m) {
            gotoLabel = m[1];
            continue;
        }

        // bare values: "1", "R", "label"
        // write value
        if (part === "0" || part === "1") {
            if (writeVal === null && moveDir === null && gotoLabel === null) {
                writeVal = parseInt(part);
                continue;
            }
        }

        // move direction
        if (part.match(/^[LRlr]$/) && moveDir === null) {
            moveDir = part.toUpperCase() === "R" ? 1 : 0;
            continue;
        }

        // goto label (bare identifier)
        if (part.match(/^[a-zA-Z_]\w*$/) && gotoLabel === null) {
            gotoLabel = part;
            continue;
        }
    }

    // apply defaults: write same, move right
    if (writeVal === null) writeVal = null; // means "same" - will be handled during emit
    if (moveDir === null) moveDir = 1; // default: move right

    return { writeVal, moveDir, gotoLabel };
}

// Convert compiled instructions to TM0 source text
function instructionsToTM0(instructions) {
    const lines = [];
    for (const instr of instructions) {
        // encode H
        const wt = instr.wt || 0;
        const wf = instr.wf || 0;
        const dt = instr.dt !== undefined ? instr.dt : 1;
        const df = instr.df !== undefined ? instr.df : 1;
        const val = (wt << 3) | (wf << 2) | (dt << 1) | df;
        const h = val.toString(16).toUpperCase();

        // encode state refs in base 90
        const st = encodeBase90(instr.st);
        const sf = encodeBase90(instr.sf);

        lines.push(`${h}${st}.${sf}`);
    }
    return lines.join("\n");
}

function encodeBase90(n) {
    const digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ%^~|[]<>{}@#&*-+=()_\"':;/,` ";
    if (n === 0) return "0";
    let result = "";
    let v = n;
    while (v > 0) {
        result = digits[v % 90] + result;
        v = Math.floor(v / 90);
    }
    return result;
}
