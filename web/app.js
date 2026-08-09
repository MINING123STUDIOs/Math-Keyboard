// TM0 Visualizer — app.js

const THUE_MORSE_SRC = `32.2
F3.3
F4.4
35.5
F6.6
37.7
38.8
F9.9
Fa.a
3b.b
3c.c
Fd.d
3e.e
Ff.f
Fg.g
30.0`;

// --- Colors ---
const C = {
    bg: "#1e1e23",
    panelBg: "#282830",
    cell0: "#3c4150",
    cell1: "#328cc8",
    cellHead: "#ffc832",
    text: "#dcdcdc",
    textDim: "#82828c",
    accent: "#64b4ff",
    border: "#50505f",
    grid0: "#282c37",
    grid1: "#328cc8",
    gridHead: "#ffc832",
};

const CELL_SIZE = 40;
const TAPE_VISIBLE = 25;
const GRID_CELL = 14;
const GRID_HEADER_H = 30;

// --- State ---
let machine = null;
let view = "classic"; // "classic" | "history"
let playing = false;
let playTimer = 0;
let playSpeed = 100;
let historyScroll = 0;
let fileName = "";

// --- DOM refs ---
const $loadPanel = document.getElementById("load-panel");
const $topBar = document.getElementById("top-bar");
const $main = document.getElementById("main");
const $canvas = document.getElementById("canvas");
const ctx = $canvas.getContext("2d");
const $stateInfo = document.getElementById("state-info");
const $tpLast = document.getElementById("tp-last");
const $tpCurrent = document.getElementById("tp-current");
const $tpPos = document.getElementById("tp-pos");
const $transTableBody = document.getElementById("trans-table-body");
const $transTableWrap = document.getElementById("trans-table-wrap");
const $historyScroll = document.getElementById("history-scroll");
const $historyScrollThumb = document.getElementById("history-scroll-thumb");

// --- Canvas sizing ---
function resizeCanvas() {
    const wrap = document.getElementById("canvas-wrap");
    $canvas.width = wrap.clientWidth * devicePixelRatio;
    $canvas.height = wrap.clientHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

// --- Load program ---
function loadProgram(source, name) {
    try {
        const instructions = parseFile(source);
        machine = new TM0Machine(instructions);
        fileName = name || "TM0 Program";
        $loadPanel.classList.add("hidden");
        $topBar.style.display = "";
        $main.style.display = "";
        resizeCanvas();
        buildTransTable();
        updateInfo();
        render();
        document.title = `TM0 — ${fileName}`;
    } catch (e) {
        alert(`Parse error: ${e.message}`);
    }
}

function buildTransTable() {
    $transTableBody.innerHTML = "";
    for (let i = 0; i < machine.instructions.length; i++) {
        const instr = machine.instructions[i];
        const stateNum = i + 1;
        const dirT = instr.dt ? "R" : "L";
        const dirF = instr.df ? "R" : "L";
        const line = document.createElement("div");
        line.id = `ttr-${stateNum}`;
        line.className = "trans-table-row" + (stateNum === machine.state ? " current" : "");
        line.textContent = ` ${String(stateNum).padStart(3)}   ${instr.wt}${dirT}->${instr.st}  ${instr.wf}${dirF}->${instr.sf}`;
        $transTableBody.appendChild(line);
    }
}

function highlightCurrentState() {
    const rows = $transTableBody.children;
    for (let i = 0; i < rows.length; i++) {
        rows[i].classList.toggle("current", i + 1 === machine.state);
    }
    // scroll current state into view
    const cur = $transTableBody.querySelector(".current");
    if (cur) cur.scrollIntoView({ block: "nearest" });
}

function updateInfo() {
    if (!machine) return;
    let txt = `State: ${machine.state}  Steps: ${machine.stepCount}`;
    if (machine.halted) txt += "  [HALTED]";
    $stateInfo.textContent = txt;
    $stateInfo.classList.toggle("halted", machine.halted);

    // Transition panel
    if (machine.transitions.length > 0) {
        const t = machine.transitions[machine.transitions.length - 1];
        const dir = t.direction === 1 ? "R" : "L";
        $tpLast.textContent = `Last transition:  read=${t.readValue}  write=${t.writeValue}  move=${dir}  state ${t.fromState} -> ${t.toState}`;
    } else {
        $tpLast.textContent = "";
    }

    if (!machine.halted && machine.state <= machine.instructions.length) {
        const instr = machine.instructions[machine.state - 1];
        const dirT = instr.dt ? "R" : "L";
        const dirF = instr.df ? "R" : "L";
        $tpCurrent.textContent = `Current state ${machine.state}:  read 1 -> write ${instr.wt}, move ${dirT}, goto ${instr.st}  |  read 0 -> write ${instr.wf}, move ${dirF}, goto ${instr.sf}`;
    } else {
        $tpCurrent.textContent = "";
    }

    $tpPos.textContent = `Head position: ${machine.head}  |  Tape cells used: ${machine.tape.size}`;

    highlightCurrentState();
}

// --- Rendering ---
function render() {
    if (!machine) return;
    resizeCanvas();
    const w = $canvas.width / devicePixelRatio;
    const h = $canvas.height / devicePixelRatio;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    if (view === "classic") {
        renderClassic(w, h);
    } else {
        renderHistory(w, h);
    }
}

function renderClassic(w, h) {
    $transTableWrap.style.display = "";
    $historyScroll.style.display = "none";

    const tableW = 280;
    const tapeW = w - tableW - 20;
    const half = Math.floor(TAPE_VISIBLE / 2);
    const startPos = machine.head - half;

    // Draw cells
    for (let i = 0; i < TAPE_VISIBLE; i++) {
        const pos = startPos + i;
        const val = machine.tape.get(pos) || 0;
        const x = 10 + i * (CELL_SIZE + 4);
        const y = 20;
        const isHead = pos === machine.head;

        ctx.fillStyle = isHead ? C.cellHead : (val ? C.cell1 : C.cell0);
        roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, 4);
        ctx.fill();

        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, 4);
        ctx.stroke();

        // Position label above
        ctx.fillStyle = C.textDim;
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(pos), x + CELL_SIZE / 2, y - 4);

        // Value inside
        ctx.fillStyle = C.text;
        ctx.font = "bold 18px monospace";
        ctx.fillText(String(val), x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 6);
    }

    // Head arrow
    const headIdx = machine.head - startPos;
    if (headIdx >= 0 && headIdx < TAPE_VISIBLE) {
        const ax = 10 + headIdx * (CELL_SIZE + 4) + CELL_SIZE / 2;
        const ay = 20 + CELL_SIZE + 6;

        ctx.fillStyle = C.cellHead;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 8, ay + 14);
        ctx.lineTo(ax + 8, ay + 14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = C.cellHead;
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`S${machine.state}`, ax, ay + 30);
    }
}

function renderHistory(w, h) {
    $transTableWrap.style.display = "none";
    $historyScroll.style.display = "";

    const nSteps = machine.history.length;
    if (nSteps === 0) return;

    // Find tape range
    let minPos = 0, maxPos = 0;
    for (const snap of machine.history) {
        for (const p of snap.tape.keys()) {
            if (p < minPos) minPos = p;
            if (p > maxPos) maxPos = p;
        }
        if (snap.head < minPos) minPos = snap.head;
        if (snap.head > maxPos) maxPos = snap.head;
    }
    minPos -= 1;
    maxPos += 1;

    const totalCols = maxPos - minPos + 1;
    const gridXOffset = 50;

    // Column headers
    ctx.fillStyle = C.panelBg;
    ctx.fillRect(0, 0, w, GRID_HEADER_H);

    ctx.fillStyle = C.textDim;
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    let col = 0;
    for (let p = minPos; p <= maxPos; p++) {
        const x = gridXOffset + col * GRID_CELL;
        if (col % 5 === 0) {
            ctx.fillText(String(p), x + GRID_CELL / 2, 20);
        }
        col++;
    }

    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(0, GRID_HEADER_H);
    ctx.lineTo(w, GRID_HEADER_H);
    ctx.stroke();

    // Grid
    const gridY = GRID_HEADER_H + 2;
    const rowH = GRID_CELL;
    const visibleRows = Math.floor((h - gridY - 30) / rowH);
    const maxScroll = Math.max(0, nSteps - visibleRows);
    historyScroll = Math.min(historyScroll, maxScroll);

    for (let row = 0; row < visibleRows; row++) {
        const idx = row + historyScroll;
        if (idx >= nSteps) break;

        const snap = machine.history[idx];
        const y = gridY + row * rowH;

        // Step number
        ctx.fillStyle = C.textDim;
        ctx.font = "11px monospace";
        ctx.textAlign = "right";
        ctx.fillText(String(idx), 40, y + rowH - 3);

        // Cells
        col = 0;
        for (let p = minPos; p <= maxPos; p++) {
            const val = snap.tape.get(p) || 0;
            const isHead = p === snap.head;
            const x = gridXOffset + col * GRID_CELL;

            if (isHead) {
                ctx.fillStyle = C.gridHead;
            } else if (val === 1) {
                ctx.fillStyle = C.grid1;
            } else {
                ctx.fillStyle = C.grid0;
            }
            ctx.fillRect(x, y, GRID_CELL - 1, rowH - 1);
            col++;
        }

        // State on right
        if (nSteps <= 200) {
            const stateX = gridXOffset + totalCols * GRID_CELL + 8;
            ctx.fillStyle = C.textDim;
            ctx.font = "11px monospace";
            ctx.textAlign = "left";
            ctx.fillText(`S${snap.state}`, stateX, y + rowH - 3);
        }
    }

    // Scrollbar
    if (nSteps > visibleRows) {
        const sbX = w - 12;
        const sbY = GRID_HEADER_H + 5;
        const sbH = h - GRID_HEADER_H - 35;
        const thumbH = Math.max(20, sbH * visibleRows / nSteps);
        const thumbY = sbY + (sbH - thumbH) * historyScroll / Math.max(1, maxScroll);

        ctx.fillStyle = C.border;
        ctx.globalAlpha = 0.5;
        roundRect(ctx, sbX, sbY, 8, sbH, 4);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#646478";
        roundRect(ctx, sbX, thumbY, 8, thumbH, 4);
        ctx.fill();
    }

    // Legend
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    let lx = 12;
    ctx.fillStyle = C.grid0;
    ctx.fillRect(lx, h - 24, 12, 12);
    ctx.fillStyle = C.textDim;
    ctx.fillText("0", lx + 16, h - 14);
    lx += 50;
    ctx.fillStyle = C.grid1;
    ctx.fillRect(lx, h - 24, 12, 12);
    ctx.fillStyle = C.textDim;
    ctx.fillText("1", lx + 16, h - 14);
    lx += 50;
    ctx.fillStyle = C.gridHead;
    ctx.fillRect(lx, h - 24, 12, 12);
    ctx.fillStyle = C.textDim;
    ctx.fillText("head", lx + 16, h - 14);
}

// --- Utility ---
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// --- Step ---
function doStep() {
    if (!machine || machine.halted) return;
    machine.step();
    updateInfo();
    render();
}

// --- Play/Pause ---
let lastPlayTime = 0;
function playLoop(ts) {
    if (!playing) return;
    if (!machine || machine.halted) {
        playing = false;
        document.getElementById("btn-play").classList.remove("active");
        document.getElementById("btn-play").textContent = "Play";
        return;
    }
    if (ts - lastPlayTime >= playSpeed) {
        machine.step();
        updateInfo();
        render();
        lastPlayTime = ts;
    }
    requestAnimationFrame(playLoop);
}

function togglePlay() {
    playing = !playing;
    const btn = document.getElementById("btn-play");
    btn.classList.toggle("active", playing);
    btn.textContent = playing ? "Pause" : "Play";
    if (playing) {
        lastPlayTime = performance.now();
        requestAnimationFrame(playLoop);
    }
}

// --- Reset ---
function doReset() {
    if (!machine) return;
    machine.reset();
    playing = false;
    historyScroll = 0;
    document.getElementById("btn-play").classList.remove("active");
    document.getElementById("btn-play").textContent = "Play";
    updateInfo();
    render();
}

// --- Speed ---
function setSpeed(ms) {
    playSpeed = Math.max(10, Math.min(2000, ms));
    document.getElementById("speed-label").textContent = `${playSpeed}ms`;
}

// --- View toggle ---
function toggleView() {
    view = view === "classic" ? "history" : "classic";
    const btn = document.getElementById("btn-view");
    btn.textContent = view === "history" ? "Classic View" : "Grid View";
    btn.classList.toggle("active", view === "history");
    render();
}

// --- Event listeners ---
// Buttons
document.getElementById("btn-step").addEventListener("click", doStep);
document.getElementById("btn-play").addEventListener("click", togglePlay);
document.getElementById("btn-reset").addEventListener("click", doReset);
document.getElementById("btn-speed-down").addEventListener("click", () => setSpeed(playSpeed + 20));
document.getElementById("btn-speed-up").addEventListener("click", () => setSpeed(playSpeed - 20));
document.getElementById("btn-view").addEventListener("click", toggleView);
document.getElementById("btn-load-new").addEventListener("click", () => {
    $loadPanel.classList.remove("hidden");
    $topBar.style.display = "none";
    $main.style.display = "none";
    machine = null;
    playing = false;
    document.title = "TM0 Visualizer";
});

// Keyboard
document.addEventListener("keydown", (e) => {
    if (!machine) return;
    if (e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
        case "Tab":
            e.preventDefault();
            toggleView();
            break;
        case "ArrowRight":
        case "n":
            doStep();
            break;
        case "r":
            doReset();
            break;
        case " ":
            e.preventDefault();
            togglePlay();
            break;
        case "ArrowUp":
            setSpeed(playSpeed - 20);
            break;
        case "ArrowDown":
            setSpeed(playSpeed + 20);
            break;
    }
});

// Mouse wheel for history view
document.getElementById("canvas-wrap").addEventListener("wheel", (e) => {
    if (view !== "history") return;
    e.preventDefault();
    historyScroll = Math.max(0, historyScroll - Math.sign(e.deltaY) * 3);
    render();
}, { passive: false });

// Resize
window.addEventListener("resize", () => { if (machine) render(); });

// --- File loading ---
const $fileInput = document.getElementById("file-input");
const $dropZone = document.getElementById("drop-zone");

$fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadProgram(reader.result, file.name);
    reader.readAsText(file);
});

$dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    $dropZone.classList.add("dragover");
});

$dropZone.addEventListener("dragleave", () => {
    $dropZone.classList.remove("dragover");
});

$dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    $dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadProgram(reader.result, file.name);
    reader.readAsText(file);
});

// Example button
document.getElementById("btn-load-example").addEventListener("click", () => {
    loadProgram(THUE_MORSE_SRC, "thue_morse.tm0");
});

// Source editor
document.getElementById("btn-load-source").addEventListener("click", () => {
    const src = document.getElementById("source-editor").value;
    if (!src.trim()) return;
    loadProgram(src, "source.tm0");
});

// --- Tab switching ---
document.querySelectorAll("#load-tabs .tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll("#load-tabs .tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
});

// --- Assembly compilation ---
const THUE_MORSE_ASM = `; Thue-Morse sequence: 0110100110010110
; 16 states, each writes one bit and moves right

s1:  always: write 0, move R, goto s2
s2:  always: write 1, move R, goto s3
s3:  always: write 1, move R, goto s4
s4:  always: write 0, move R, goto s5
s5:  always: write 1, move R, goto s6
s6:  always: write 0, move R, goto s7
s7:  always: write 0, move R, goto s8
s8:  always: write 1, move R, goto s9
s9:  always: write 1, move R, goto s10
s10: always: write 0, move R, goto s11
s11: always: write 0, move R, goto s12
s12: always: write 1, move R, goto s13
s13: always: write 0, move R, goto s14
s14: always: write 1, move R, goto s15
s15: always: write 1, move R, goto s16
s16: always: write 0, move R, goto halt`;

function showAsmErrors(errors) {
    const el = document.getElementById("asm-errors");
    if (!errors || errors.length === 0) {
        el.textContent = "";
        return;
    }
    el.textContent = errors.map(e => `line ${e.line}: ${e.message}`).join("\n");
}

document.getElementById("btn-asm-compile").addEventListener("click", () => {
    const src = document.getElementById("asm-editor").value;
    if (!src.trim()) return;
    const result = compileAssembly(src);
    if (result.errors.length > 0) {
        showAsmErrors(result.errors);
        return;
    }
    showAsmErrors([]);
    const tm0src = instructionsToTM0(result.instructions);
    loadProgram(tm0src, "assembly.tm0");
});

document.getElementById("btn-asm-to-tm0").addEventListener("click", () => {
    const src = document.getElementById("asm-editor").value;
    if (!src.trim()) return;
    const result = compileAssembly(src);
    if (result.errors.length > 0) {
        showAsmErrors(result.errors);
        return;
    }
    showAsmErrors([]);
    const tm0src = instructionsToTM0(result.instructions);
    // show in source tab for copying
    document.getElementById("source-editor").value = tm0src;
    // switch to source tab
    document.querySelectorAll("#load-tabs .tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector('[data-tab="source"]').classList.add("active");
    document.getElementById("tab-source").classList.add("active");
});

// Assembly example button
document.getElementById("btn-asm-example").addEventListener("click", () => {
    document.getElementById("asm-editor").value = THUE_MORSE_ASM;
    // switch to asm tab
    document.querySelectorAll("#load-tabs .tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector('[data-tab="asm"]').classList.add("active");
    document.getElementById("tab-asm").classList.add("active");
});

// Also load the Thue-Morse example into the asm editor by default
document.getElementById("asm-editor").value = THUE_MORSE_ASM;

// --- IR compilation ---
const THUE_MORSE_IR = `; Thue-Morse sequence
; Generates: 0110100110010110

bit current
int4 counter

current = 1
counter = 0

while counter < 16:
    print current
    if current == 1:
        current = 0
    else:
        current = 1
    counter = counter + 1`;

function showIRErrors(errors) {
    const el = document.getElementById("ir-errors");
    if (!errors || errors.length === 0) {
        el.textContent = "";
        return;
    }
    el.textContent = errors.map(e => `line ${e.line}: ${e.message}`).join("\n");
}

document.getElementById("btn-ir-compile").addEventListener("click", () => {
    const src = document.getElementById("ir-editor").value;
    if (!src.trim()) return;
    const result = compileIR(src);
    if (result.errors.length > 0) {
        showIRErrors(result.errors);
        return;
    }
    showIRErrors([]);
    const tm0src = instructionsToTM0(result.instructions);
    loadProgram(tm0src, "ir.tm0");
});

document.getElementById("btn-ir-to-asm").addEventListener("click", () => {
    const src = document.getElementById("ir-editor").value;
    if (!src.trim()) return;
    const result = compileIR(src);
    if (result.errors.length > 0) {
        showIRErrors(result.errors);
        return;
    }
    showIRErrors([]);
    // Show generated assembly in asm tab
    document.getElementById("asm-editor").value = result.assembly;
    document.querySelectorAll("#load-tabs .tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector('[data-tab="asm"]').classList.add("active");
    document.getElementById("tab-asm").classList.add("active");
});

// IR example button
document.getElementById("btn-ir-example").addEventListener("click", () => {
    document.getElementById("ir-editor").value = THUE_MORSE_IR;
    // switch to ir tab
    document.querySelectorAll("#load-tabs .tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector('[data-tab="ir"]').classList.add("active");
    document.getElementById("tab-ir").classList.add("active");
});

// Load Thue-Morse IR into editor by default
document.getElementById("ir-editor").value = THUE_MORSE_IR;
