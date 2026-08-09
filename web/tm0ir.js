// TM0 High-Level IR Compiler
// Compiles Python-like source directly to TM0 instructions
//
// Key constraint: TM0 has no "stay in place" — every state must move L or R.
// Design: every operation (write, branch, goto) also moves R by 1.
// moveTo(target) positions the head via pure-move states that preserve cells.
// After any operation, headPos is one step right of the operation position.

// ============================================================
// LEXER
// ============================================================

const IR_KEYWORDS = new Set(["bit", "int4", "if", "else", "while", "print", "not", "halt"]);

function irTokenize(source) {
    const tokens = [];
    const lines = source.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        let col = 0;

        while (col < line.length) {
            if (line[col] === " " || line[col] === "\t") { col++; continue; }
            if (line[col] === ";") { col = line.length; continue; }

            if (line[col] >= "0" && line[col] <= "9") {
                let num = "";
                while (col < line.length && line[col] >= "0" && line[col] <= "9") {
                    num += line[col]; col++;
                }
                tokens.push({ type: "NUMBER", value: parseInt(num), line: lineNum + 1, col: col - num.length });
                continue;
            }

            if ((line[col] >= "a" && line[col] <= "z") || (line[col] >= "A" && line[col] <= "Z") || line[col] === "_") {
                let id = "";
                while (col < line.length && ((line[col] >= "a" && line[col] <= "z") || (line[col] >= "A" && line[col] <= "Z") || (line[col] >= "0" && line[col] <= "9") || line[col] === "_")) {
                    id += line[col]; col++;
                }
                const type = IR_KEYWORDS.has(id) ? "KEYWORD" : "IDENT";
                tokens.push({ type, value: id, line: lineNum + 1, col: col - id.length });
                continue;
            }

            if (line[col] === "=" && col + 1 < line.length && line[col + 1] === "=") {
                tokens.push({ type: "OP", value: "==", line: lineNum + 1, col }); col += 2; continue;
            }
            if (line[col] === "!" && col + 1 < line.length && line[col + 1] === "=") {
                tokens.push({ type: "OP", value: "!=", line: lineNum + 1, col }); col += 2; continue;
            }
            if (line[col] === "<" && col + 1 < line.length && line[col + 1] === "=") {
                tokens.push({ type: "OP", value: "<=", line: lineNum + 1, col }); col += 2; continue;
            }
            if (line[col] === ">" && col + 1 < line.length && line[col + 1] === "=") {
                tokens.push({ type: "OP", value: ">=", line: lineNum + 1, col }); col += 2; continue;
            }

            const singleOps = "=+-<>";
            if (singleOps.includes(line[col])) {
                tokens.push({ type: "OP", value: line[col], line: lineNum + 1, col }); col++; continue;
            }

            const punct = ":()";
            if (punct.includes(line[col])) {
                tokens.push({ type: "PUNCT", value: line[col], line: lineNum + 1, col }); col++; continue;
            }

            col++;
        }
    }

    tokens.push({ type: "EOF", value: null, line: lines.length + 1, col: 0 });
    return tokens;
}

// ============================================================
// PARSER (unchanged)
// ============================================================

class IRParser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
        this.errors = [];
    }

    peek() { return this.tokens[this.pos]; }
    advance() { return this.tokens[this.pos++]; }

    expect(type, value) {
        const t = this.peek();
        if (t.type !== type || (value !== undefined && t.value !== value)) {
            this.errors.push({ line: t.line, message: `expected ${value || type}, got "${t.value}" (${t.type})` });
            return null;
        }
        return this.advance();
    }

    parse() { return { type: "Program", body: this.parseBlock() }; }

    parseBlock() {
        const stmts = [];
        while (this.peek().type !== "EOF") {
            const s = this.parseStatement();
            if (s) stmts.push(s);
        }
        return stmts;
    }

    parseStatement() {
        const t = this.peek();
        if (t.type === "KEYWORD" && (t.value === "bit" || t.value === "int4")) return this.parseVarDecl();
        if (t.type === "KEYWORD" && t.value === "if") return this.parseIf();
        if (t.type === "KEYWORD" && t.value === "while") return this.parseWhile();
        if (t.type === "KEYWORD" && t.value === "print") return this.parsePrint();
        if (t.type === "IDENT") return this.parseAssign();
        this.errors.push({ line: t.line, message: `unexpected token "${t.value}"` });
        this.advance();
        return null;
    }

    parseVarDecl() {
        const typeTok = this.advance();
        const nameTok = this.expect("IDENT");
        if (!nameTok) return null;
        return { type: "VarDecl", varType: typeTok.value, name: nameTok.value, line: typeTok.line };
    }

    parseAssign() {
        const nameTok = this.advance();
        this.expect("OP", "=");
        const expr = this.parseExpr();
        return { type: "Assign", name: nameTok.value, expr, line: nameTok.line };
    }

    parseIf() {
        const kw = this.advance();
        const cond = this.parseExpr();
        this.expect("PUNCT", ":");
        const thenBody = this.parseIndentedBlock();
        let elseBody = null;
        if (this.peek().type === "KEYWORD" && this.peek().value === "else") {
            this.advance();
            this.expect("PUNCT", ":");
            elseBody = this.parseIndentedBlock();
        }
        return { type: "If", cond, thenBody, elseBody, line: kw.line };
    }

    parseWhile() {
        const kw = this.advance();
        const cond = this.parseExpr();
        this.expect("PUNCT", ":");
        const body = this.parseIndentedBlock();
        return { type: "While", cond, body, line: kw.line };
    }

    parsePrint() {
        const kw = this.advance();
        const expr = this.parseExpr();
        return { type: "Print", expr, line: kw.line };
    }

    parseIndentedBlock() {
        const stmts = [];
        const baseCol = this.peek().col || 0;
        while (this.peek().type !== "EOF") {
            const t = this.peek();
            if (t.type === "KEYWORD" && t.value === "else" && (t.col || 0) <= baseCol) break;
            if (t.type === "KEYWORD" && (t.value === "bit" || t.value === "int4" || t.value === "while" || t.value === "if") && (t.col || 0) <= baseCol) break;
            if (t.type === "IDENT" && (t.col || 0) < baseCol) break;
            const s = this.parseStatement();
            if (s) stmts.push(s);
        }
        return stmts;
    }

    parseExpr() { return this.parseComparison(); }

    parseComparison() {
        let left = this.parseAddSub();
        const t = this.peek();
        if (t.type === "OP" && (t.value === "==" || t.value === "!=" || t.value === "<" || t.value === ">" || t.value === "<=" || t.value === ">=")) {
            const op = this.advance();
            const right = this.parseAddSub();
            return { type: "BinOp", op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseAddSub() {
        let left = this.parseUnary();
        while (this.peek().type === "OP" && (this.peek().value === "+" || this.peek().value === "-")) {
            const op = this.advance();
            const right = this.parseUnary();
            left = { type: "BinOp", op: op.value, left, right, line: op.line };
        }
        return left;
    }

    parseUnary() {
        if (this.peek().type === "KEYWORD" && this.peek().value === "not") {
            const op = this.advance();
            const operand = this.parsePrimary();
            return { type: "UnaryOp", op: "not", operand, line: op.line };
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const t = this.peek();
        if (t.type === "NUMBER") { this.advance(); return { type: "Literal", value: t.value, line: t.line }; }
        if (t.type === "IDENT") { this.advance(); return { type: "Var", name: t.value, line: t.line }; }
        if (t.type === "PUNCT" && t.value === "(") {
            this.advance();
            const expr = this.parseExpr();
            this.expect("PUNCT", ")");
            return expr;
        }
        this.errors.push({ line: t.line, message: `unexpected token in expression: "${t.value}"` });
        this.advance();
        return { type: "Literal", value: 0, line: t.line };
    }
}

// ============================================================
// TAPE ALLOCATOR
// ============================================================

function allocateTape(ast) {
    const vars = {};
    let nextPos = 0;
    for (const stmt of ast.body) {
        if (stmt.type === "VarDecl") {
            const size = stmt.varType === "int4" ? 4 : 1;
            vars[stmt.name] = { type: stmt.varType, pos: nextPos, size };
            nextPos += size;
        }
    }
    return vars;
}

// ============================================================
// DIRECT TM0 INSTRUCTION CODE GENERATOR
//
// Design rules:
// 1. moveTo(target): emits pure-move states (preserve cells, wt=1 wf=0)
//    that move the head step by step to `target`.
//    After moveTo, headPos == target.
//
// 2. Every "operation" state (write, branch, goto) moves R by 1.
//    After an operation at position P, headPos == P + 1.
//
// 3. When moveTo is needed between operations, it adjusts from
//    the current headPos to the target.
//
// 4. Labels and patches handle forward/backward references.
// ============================================================

class IRCodeGen {
constructor(vars) {
        this.vars = vars;
        this.instructions = [];
        this.headPos = 0;
        this.outputPos = 100;
        this.labelCounter = 0;
        this.labelMap = {};
        this.patches = [];
        this.pendingCont = null;
        this.expectedHeadPos = {};
        this.labelHeadPos = {};
    }

    defineLabel(name) {
        this.flushPendingCont();
        // Sync head position if this label was reached via a branch with different expectation
        const expected = this.expectedHeadPos[name];
        if (expected !== undefined && expected !== this.headPos) {
            this.moveTo(expected);
        }
        delete this.expectedHeadPos[name];
        this.labelMap[name] = this.instructions.length + 1;
        this.labelHeadPos[name] = this.headPos;
    }

    newLabel(prefix) {
        return `_${prefix}_${this.labelCounter++}`;
    }

    addState(wt, wf, dt, df, st, sf) {
        this.flushPendingCont();
        const idx = this.instructions.length + 1;
        this.instructions.push({
            wt: wt !== null ? wt : 1,
            wf: wf !== null ? wf : 0,
            dt: dt !== null ? dt : 1,
            df: df !== null ? df : 1,
            st: st !== undefined ? st : 0,
            sf: sf !== undefined ? sf : 0
        });
        return idx;
    }

    patchField(stateIndex, field, label) {
        this.patches.push({ stateIndex, field, label });
    }

    flushPendingCont() {
        if (this.pendingCont !== null) {
            const lbl = this.pendingCont;
            this.pendingCont = null;
            this.labelMap[lbl] = this.instructions.length + 1;
        }
    }

    resolvePatches() {
        for (const p of this.patches) {
            const target = this.labelMap[p.label];
            if (target === undefined) {
                throw new Error(`undefined label "${p.label}"`);
            }
            this.instructions[p.stateIndex - 1][p.field] = target;
        }
    }

    // --- Move head to absolute position ---
    // Emits states that preserve each cell and move step-by-step.
    // After this, headPos == target.
    moveTo(target) {
        const diff = target - this.headPos;
        if (diff === 0) return;

        this.flushPendingCont();

        const dir = diff > 0 ? 1 : 0; // 1=R, 0=L
        const count = Math.abs(diff);

        for (let i = 0; i < count; i++) {
            const isLast = (i === count - 1);
            // Preserve cell: wt=1,wf=0 (write back what we read), move dir
            if (!isLast) {
                // Intermediate: go to next move state (linear chain)
                const myIdx = this.instructions.length + 1;
                this.instructions.push({ wt: 1, wf: 0, dt: dir, df: dir, st: myIdx + 1, sf: myIdx + 1 });
            } else {
                // Last: set up pending continuation
                const myIdx = this.instructions.length + 1;
                this.pendingCont = this.newLabel("cont");
                this.instructions.push({ wt: 1, wf: 0, dt: dir, df: dir, st: 0, sf: 0 });
                this.patchField(myIdx, 'st', this.pendingCont);
                this.patchField(myIdx, 'sf', this.pendingCont);
            }
        }

        this.headPos = target;
    }

    // --- Operation: write value at current position, move R ---
    // After this, headPos = original + 1
    emitWrite(val, gotoLabel) {
        const idx = this.addState(val, val, 1, 1, 0, 0);
        if (gotoLabel) {
            this.patchField(idx, 'st', gotoLabel);
            this.patchField(idx, 'sf', gotoLabel);
        } else {
            const contLbl = this.newLabel("cont");
            this.patchField(idx, 'st', contLbl);
            this.patchField(idx, 'sf', contLbl);
            this.pendingCont = contLbl;
        }
        this.headPos++;
        return idx;
    }

    // --- Operation: read cell, preserve it, move R, branch ---
    // After this, headPos = original + 1
    emitBranch(thenLabel, elseLabel) {
        if (thenLabel in this.labelMap && thenLabel in this.labelHeadPos) {
            const targetHead = this.labelHeadPos[thenLabel];
            const afterBranchHead = this.headPos + 1;
            if (targetHead !== afterBranchHead) {
                this.moveTo(targetHead - 1);
            }
        }
        if (elseLabel in this.labelMap && elseLabel in this.labelHeadPos) {
            const targetHead = this.labelHeadPos[elseLabel];
            const afterBranchHead = this.headPos + 1;
            if (targetHead !== afterBranchHead) {
                this.moveTo(targetHead - 1);
            }
        }
        const expectedAtTarget = this.headPos + 1;
        if (!(thenLabel in this.labelMap)) {
            this.expectedHeadPos[thenLabel] = expectedAtTarget;
        }
        if (!(elseLabel in this.labelMap)) {
            this.expectedHeadPos[elseLabel] = expectedAtTarget;
        }
        const idx = this.addState(1, 0, 1, 1, 0, 0);
        this.patchField(idx, 'st', thenLabel);
        this.patchField(idx, 'sf', elseLabel);
        this.headPos++;
        return idx;
    }

    // --- Operation: preserve cell, move R, goto label ---
    // After this, headPos = original + 1
    emitGoto(label) {
        if (label in this.labelMap && label in this.labelHeadPos) {
            const targetHead = this.labelHeadPos[label];
            const afterGotoHead = this.headPos + 1;
            if (targetHead !== afterGotoHead) {
                this.moveTo(targetHead - 1);
            }
        }
        const expectedAtTarget = this.headPos + 1;
        if (!(label in this.labelMap)) {
            this.expectedHeadPos[label] = expectedAtTarget;
        }
        const idx = this.addState(1, 0, 1, 1, 0, 0);
        this.patchField(idx, 'st', label);
        this.patchField(idx, 'sf', label);
        this.headPos++;
        return idx;
    }

    // --- Program generation ---

    genProgram(ast) {
        for (const stmt of ast.body) {
            this.genStatement(stmt);
        }
        // Final halt
        this.addState(0, 0, 1, 1, 0, 0);
        return this.instructions;
    }

    genStatement(stmt) {
        switch (stmt.type) {
            case "VarDecl": break;
            case "Assign": this.genAssign(stmt); break;
            case "If": this.genIf(stmt); break;
            case "While": this.genWhile(stmt); break;
            case "Print": this.genPrint(stmt); break;
        }
    }

    // --- Assignment ---

    genAssign(stmt) {
        const v = this.vars[stmt.name];
        if (!v) return;
        const expr = stmt.expr;

        if (expr.type === "Literal") {
            this.moveTo(v.pos);
            this.emitWrite(expr.value, null);
        } else if (expr.type === "Var") {
            const src = this.vars[expr.name];
            if (!src) return;
            this.genCopyBit(src.pos, v.pos);
        } else if (expr.type === "UnaryOp" && expr.op === "not") {
            const src = this.vars[expr.operand.name];
            if (!src) return;
            this.genCopyBitNegated(src.pos, v.pos);
        } else if (expr.type === "BinOp" && (expr.op === "+" || expr.op === "-") && expr.left.type === "Var" && expr.right.type === "Literal") {
            const src = this.vars[expr.left.name];
            if (!src) return;
            this.genIncrementDecrement(src.pos, expr.op === "+" ? 1 : -1);
        }
    }

    // Copy bit from srcPos to destPos
    genCopyBit(srcPos, destPos) {
        this.moveTo(srcPos);
        const thenLbl = this.newLabel("cp1");
        const elseLbl = this.newLabel("cp0");
        const endLbl = this.newLabel("cpdone");

        // Read src, branch (head moves R after)
        this.emitBranch(thenLbl, elseLbl);

        // Read 1: write 1 at dest, move R
        this.defineLabel(thenLbl);
        this.moveTo(destPos);
        this.emitWrite(1, endLbl);

        // Read 0: write 0 at dest, move R
        this.defineLabel(elseLbl);
        this.moveTo(destPos);
        this.emitWrite(0, endLbl);

        this.defineLabel(endLbl);
    }

    // Copy negated bit
    genCopyBitNegated(srcPos, destPos) {
        this.moveTo(srcPos);
        const thenLbl = this.newLabel("neg1");
        const elseLbl = this.newLabel("neg0");
        const endLbl = this.newLabel("negdone");

        this.emitBranch(thenLbl, elseLbl);

        this.defineLabel(thenLbl);
        this.moveTo(destPos);
        this.emitWrite(0, endLbl);

        this.defineLabel(elseLbl);
        this.moveTo(destPos);
        this.emitWrite(1, endLbl);

        this.defineLabel(endLbl);
    }

    // Increment or decrement the 4-bit integer starting at srcPos (LSB-first)
    genIncrementDecrement(srcPos, delta) {
        this.moveTo(srcPos);
        const loopLbl = this.newLabel("inc_loop");
        const flipLbl = this.newLabel("inc_flip");
        const doneLbl = this.newLabel("inc_done");

        if (delta === 1) {
            // Increment: scan from LSB
            this.defineLabel(loopLbl);
            // Read bit, move R: 1->carry, 0->done
            this.emitBranch(flipLbl, doneLbl);

            this.defineLabel(flipLbl);
            // Move back to current bit, write 0 (carry), move R
            this.moveTo(srcPos);
            this.emitWrite(0, loopLbl);

            this.defineLabel(doneLbl);
            // Move back to current bit, write 1 (found 0), move R
            this.moveTo(srcPos);
            this.emitWrite(1, null);
        } else {
            // Decrement: scan from LSB
            this.defineLabel(loopLbl);
            // Read bit, move R: 1->done, 0->borrow
            this.emitBranch(doneLbl, flipLbl);

            this.defineLabel(flipLbl);
            // Move back to current bit, write 1 (borrow), move R
            this.moveTo(srcPos);
            this.emitWrite(1, loopLbl);

            this.defineLabel(doneLbl);
            // Move back to current bit, write 0 (found 1), move R
            this.moveTo(srcPos);
            this.emitWrite(0, null);
        }
    }

    genIf(stmt) {
        const cond = stmt.cond;
        const thenLbl = this.newLabel("if_then");
        const elseLbl = this.newLabel("if_else");
        const endLbl = this.newLabel("if_end");

        this.genCondition(cond, thenLbl, elseLbl);

        this.defineLabel(thenLbl);
        for (const s of stmt.thenBody) this.genStatement(s);
        this.emitGoto(endLbl);

        this.defineLabel(elseLbl);
        if (stmt.elseBody) {
            for (const s of stmt.elseBody) this.genStatement(s);
        }

        this.defineLabel(endLbl);
    }

    genWhile(stmt) {
        const cond = stmt.cond;
        const startLbl = this.newLabel("while_start");
        const bodyLbl = this.newLabel("while_body");
        const endLbl = this.newLabel("while_end");

        this.defineLabel(startLbl);
        this.genCondition(cond, bodyLbl, endLbl);

        this.defineLabel(bodyLbl);
        for (const s of stmt.body) this.genStatement(s);
        this.emitGoto(startLbl);

        this.defineLabel(endLbl);
    }

    // Generate condition code: if cond then goto thenLabel else goto elseLabel
    genCondition(cond, thenLabel, elseLabel) {
        if (cond.type === "BinOp" && cond.op === "==" && cond.left.type === "Var" && cond.right.type === "Literal") {
            const v = this.vars[cond.left.name];
            const val = cond.right.value;
            this.moveTo(v.pos);
            if (val === 1) {
                this.emitBranch(thenLabel, elseLabel);
            } else {
                this.emitBranch(elseLabel, thenLabel);
            }
        } else if (cond.type === "BinOp" && cond.op === "!=" && cond.left.type === "Var" && cond.right.type === "Literal") {
            const v = this.vars[cond.left.name];
            const val = cond.right.value;
            this.moveTo(v.pos);
            if (val === 1) {
                this.emitBranch(elseLabel, thenLabel);
            } else {
                this.emitBranch(thenLabel, elseLabel);
            }
        } else if (cond.type === "BinOp" && cond.op === "<" && cond.left.type === "Var" && cond.right.type === "Literal") {
            const v = this.vars[cond.left.name];
            if (v && v.type === "int4") {
                this.genComparison4Bit(v.pos, cond.right.value, thenLabel, elseLabel);
            }
        } else if (cond.type === "BinOp" && cond.op === "==" && cond.left.type === "Var" && cond.right.type === "Var") {
            const left = this.vars[cond.left.name];
            const right = this.vars[cond.right.name];
            if (left && left.type === "bit" && right && right.type === "bit") {
                this.genEqualBit(left.pos, right.pos, thenLabel, elseLabel);
            }
        }
    }

    // Check if bit at leftPos == bit at rightPos
    genEqualBit(leftPos, rightPos, thenLabel, elseLabel) {
        const midLbl = this.newLabel("eq_mid");
        this.moveTo(leftPos);
        this.emitBranch(midLbl, elseLbl); // read left: 1 -> check right, 0 -> not equal (if right is 1)

        this.defineLabel(midLbl);
        // left was 1, now at leftPos+1. Need to go to rightPos.
        this.moveTo(rightPos);
        this.emitBranch(thenLabel, elseLbl); // read right: 1 -> equal (both 1), 0 -> not equal
    }

    // 4-bit unsigned comparison: if varPos < literal then thenLabel else elseLabel
    genComparison4Bit(varPos, literal, thenLabel, elseLabel) {
        const lit = literal & 0xF;
        if (literal >= 16) { this.emitGoto(thenLabel); return; }
        if (lit === 0) { this.emitGoto(elseLabel); return; }

        const litBits = [];
        for (let i = 3; i >= 0; i--) litBits.push((lit >> i) & 1);

        for (let i = 0; i < 4; i++) {
            const bitPos = varPos + (3 - i);
            const litBit = litBits[i];

            this.moveTo(bitPos);

            if (litBit === 1) {
                const continueLbl = this.newLabel("cmp_cont");
                // Read: 1->same, continue; 0->less, true
                this.emitBranch(continueLbl, thenLabel);
                this.defineLabel(continueLbl);
            } else {
                const continueLbl = this.newLabel("cmp_cont");
                // Read: 1->greater, false; 0->same, continue
                this.emitBranch(elseLabel, continueLbl);
                this.defineLabel(continueLbl);
            }
        }
        // All bits equal => not less
        this.emitGoto(elseLabel);
    }

    genPrint(stmt) {
        const expr = stmt.expr;
        if (expr.type === "Literal") {
            this.moveTo(this.outputPos);
            this.emitWrite(expr.value, null);
            this.outputPos++;
            return;
        }
        const v = this.vars[expr.name];
        if (!v) return;

        this.moveTo(v.pos);
        const write1Lbl = this.newLabel("prt1");
        const write0Lbl = this.newLabel("prt0");
        const endLbl = this.newLabel("prtend");

        this.emitBranch(write1Lbl, write0Lbl);

        this.defineLabel(write1Lbl);
        this.moveTo(this.outputPos);
        this.emitWrite(1, endLbl);

        this.defineLabel(write0Lbl);
        this.moveTo(this.outputPos);
        this.emitWrite(0, endLbl);

        this.defineLabel(endLbl);
        this.outputPos++;
    }
}

// ============================================================
// MAIN COMPILER FUNCTION
// ============================================================

function compileIR(source) {
    const errors = [];
    const tokens = irTokenize(source);
    const parser = new IRParser(tokens);
    const ast = parser.parse();
    if (parser.errors.length > 0) {
        return { assembly: null, instructions: null, errors: parser.errors };
    }

    const vars = allocateTape(ast);
    const codegen = new IRCodeGen(vars);
    let instructions;
    try {
        codegen.genProgram(ast);
        codegen.resolvePatches();
        instructions = codegen.instructions;
    } catch (e) {
        return { assembly: null, instructions: null, errors: [{ line: 1, message: e.message }] };
    }

    const assembly = instructionsToAssembly(instructions, codegen.labelMap);
    return { assembly, instructions, errors: [], vars };
}

function instructionsToAssembly(instructions, labelMap) {
    const lines = ["; Generated by TM0 IR Compiler", ";"];
    const stateLabels = {};
    for (const [label, num] of Object.entries(labelMap)) {
        if (!stateLabels[num]) stateLabels[num] = [];
        stateLabels[num].push(label);
    }

    for (let i = 0; i < instructions.length; i++) {
        const stateNum = i + 1;
        const instr = instructions[i];
        const labels = stateLabels[stateNum];

        if (labels) {
            for (const l of labels) lines.push(`${l}:`);
        }

        const dt = instr.dt === 1 ? "R" : "L";
        const df = instr.df === 1 ? "R" : "L";
        const st = instr.st === 0 ? "halt" : `s${instr.st}`;
        const sf = instr.sf === 0 ? "halt" : `s${instr.sf}`;

        if (instr.wt === instr.wf && instr.dt === instr.df && instr.st === instr.sf) {
            lines.push(`  s${stateNum}: always: write ${instr.wt}, move ${dt}, goto ${st}`);
        } else {
            lines.push(`  s${stateNum}: on 1: write ${instr.wt}, move ${dt}, goto ${st}`);
            lines.push(`        on 0: write ${instr.wf}, move ${df}, goto ${sf}`);
        }
    }

    return lines.join("\n");
}
