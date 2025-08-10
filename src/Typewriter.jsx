import { useEffect, useMemo, useRef, useState } from "react";
import "./typewriter.css";

export default function Typewriter({ onVirtualKey }) {
  const svgRef = useRef(null);

  /* ---------- layout ---------- */
  const keyW = 60;        // square keys → perfect circles with CSS
  const keyH = 60;
  const gap  = 12;
  const startX = 36;
  const startY = 36;

  // per-row horizontal indent (numbers, QZERTY, ASDF, WXCV)
  const rowIndents = [0, 0, 28, 70];

  // how much to push Shift to the right (to avoid overlap with bottom row)
  const SHIFT_OFFSET = 16; // try 12–24 if you want more/less spacing

  /* ---------- rows ---------- */
  const rowNums    = ["1","2","3","4","5","6","7","8","9","0"];
  /* ---------- sound ---------- */
  const keySound = useMemo(() => new Audio("mixkit-mechanical-typewriter-hit-1365.wav"), []); // put your sound file in /public

  const playKeySound = () => {
    keySound.currentTime = 0; // rewind so rapid presses still play
    keySound.play().catch(() => {}); // ignore autoplay restrictions errors
  };

  const rowQZERTY  = ["Q","Z","E","R","T","Y","U","I","O","P"];
  const rowASDF    = ["A","S","D","F","G","H","J","K","L"];
  const rowWXCV    = ["W","X","C","V","B","N","M"];

  /* ---------- key geometry ---------- */
  const makeRow = (letters, rowIndex /* 0..3 */) => {
    const y = startY + rowIndex * (keyH + gap);
    const indent = rowIndents[rowIndex];
    return letters.map((label, i) => {
      const x = startX + indent + i * (keyW + gap);
      // KeyboardEvent.code names: digits use Digit1..Digit0, letters use KeyA..KeyZ
      const code =
        /[0-9]/.test(label) ? (label === "0" ? "Digit0" : `Digit${label}`) : `Key${label}`;
      return { label, code, x, y, w: keyW, h: keyH };
    });
  };

  const numKeys   = useMemo(() => makeRow(rowNums,   0), []);
  const qRowKeys  = useMemo(() => makeRow(rowQZERTY, 1), []);
  const aRowKeys  = useMemo(() => makeRow(rowASDF,   2), []);
  const wRowKeys  = useMemo(() => makeRow(rowWXCV,   3), []);
  const letterKeys = [...qRowKeys, ...aRowKeys, ...wRowKeys];

  // right edges for layout math
  const numRight =
    rowIndents[0] + rowNums.length * keyW + (rowNums.length - 1) * gap;
  const qRowRight =
    rowIndents[1] + rowQZERTY.length * keyW + (rowQZERTY.length - 1) * gap;
  const aRowRight =
    rowIndents[2] + rowASDF.length * keyW + (rowASDF.length - 1) * gap;
  const wRowRight =
    rowIndents[3] + rowWXCV.length * keyW + (rowWXCV.length - 1) * gap;

  // Backspace: to the right of number row
  const backW = keyW * 1.4 + gap * 0.4;
  const backH = keyH;
  const backX = startX + numRight + gap;
  const backY = startY + 0 * (keyH + gap);

  // Enter: to the right of ASDF row, spanning ASDF + WXCV rows
  const enterW = keyW + gap * 2;
  const enterH = keyH * 2 + gap;
  const enterX = startX + aRowRight + gap;
  const enterY = startY + 2 * (keyH + gap); // start at ASDF row (row index 2 overall)

  // Shift: left of WXCV row, nudged to the right by SHIFT_OFFSET
  const shiftW = keyW * 1.6 + gap * 0.6;
  const shiftH = keyH;
  const shiftX = startX + rowIndents[3] - (shiftW + gap) + SHIFT_OFFSET;
  const shiftY = startY + 3 * (keyH + gap);

  // Space centered under everything
  const contentW = Math.max(numRight, qRowRight, aRowRight + gap + enterW, wRowRight);
  const spaceW = keyW * 6 + gap * 5;
  const spaceH = keyH * 0.8;
  const spaceX = startX + (contentW - spaceW) / 2;
  const spaceY = startY + 4 * (keyH + gap);

  const specialKeys = [
    { label: "BACK",  code: "Backspace", x: backX,  y: backY,  w: backW,  h: backH },
    { label: "ENTER", code: "Enter",     x: enterX, y: enterY, w: enterW, h: enterH },
    { label: "SPACE", code: "Space",     x: spaceX, y: spaceY, w: spaceW, h: spaceH },
    { label: "SHIFT", code: "ShiftLeft", x: shiftX, y: shiftY, w: shiftW, h: shiftH },
  ];

  /* ---------- Shift latch ---------- */
  const [shiftLatched, setShiftLatched] = useState(false);
  const send = (val) => onVirtualKey && onVirtualKey(val);

  const handleVirtualPress = (code, payload) => {
    playKeySound(); // Play the key sound on every virtual key press
    if (!onVirtualKey) return;
    if (code === "ShiftLeft") { setShiftLatched(true); return; }
    if (code === "Space")     { send(" "); setShiftLatched(false); return; }
    if (code === "Enter")     { send("\n"); setShiftLatched(false); return; }
    if (code === "Backspace") { send("\b"); return; }

    // digits
    if (/[0-9]/.test(payload)) { send(payload); setShiftLatched(false); return; }

    // letters
    const ch = shiftLatched ? payload.toUpperCase() : payload.toLowerCase();
    send(ch);
    setShiftLatched(false);
  };

  /* ---------- physical key highlight ---------- */
  useEffect(() => {
    const root = svgRef.current;
    if (!root) return;
    const keyMap = new Map([...root.querySelectorAll(".key")].map(el => [el.dataset.code, el]));
    const setHover = (code, on) => keyMap.get(code)?.classList.toggle("is-hovered", on);
    const setActive = (code, on) => keyMap.get(code)?.classList.toggle("is-active", on);

    const down = (e) => {
      if (!e.repeat) {
        playKeySound(); // Play the key sound on keydown
        setHover(e.code, true);
        setActive(e.code, true);
        if (e.code === "ShiftLeft" || e.code === "ShiftRight") setShiftLatched(true);
      }
    };
    const up = (e) => {
      setActive(e.code, false);
      setTimeout(() => setHover(e.code, false), 70);
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") setShiftLatched(false);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ---------- viewBox ---------- */
  const vbWidth  = startX * 2 + contentW + backW + gap;
  const vbHeight = startY * 2 + (5 * keyH) + (4 * gap) + spaceH; // 4 rows + space

  /* ---------- render ---------- */
  return (
    <svg
      ref={svgRef}
      className={`board ${shiftLatched ? "shift-on" : ""}`}
      viewBox={`0 0 ${vbWidth} ${vbHeight}`}
      role="img"
      aria-label="Typewriter with numbers, Shift latch, Backspace"
    >
      {/* number row */}
      {numKeys.map(({ label, code, x, y, w, h }) => (
        <g className="key" data-code={code} key={code}
           onMouseDown={() => handleVirtualPress(code, label)}>
          <rect x={x} y={y} width={w} height={h} className="top" rx="50%" ry="50%" />
          <rect x={x} y={y} width={w} height={h} fill="none" rx="50%" ry="50%" />
          <text x={x + w / 2} y={y + h / 2 + 6} textAnchor="middle">{label}</text>
        </g>
      ))}

      {/* letters (QZERTY / ASDF / WXCV) */}
      {letterKeys.map(({ label, code, x, y, w, h }) => (
        <g className="key" data-code={code} key={code}
           onMouseDown={() => handleVirtualPress(code, label)}>
          <rect x={x} y={y} width={w} height={h} className="top" rx="50%" ry="50%" />
          <rect x={x} y={y} width={w} height={h} fill="none" rx="50%" ry="50%" />
          <text x={x + w / 2} y={y + h / 2 + 6} textAnchor="middle">
            {shiftLatched ? label.toUpperCase() : label.toLowerCase()}
          </text>
        </g>
      ))}

      {/* Backspace / Enter / Space / Shift */}
      {specialKeys.map(({ label, code, x, y, w, h }) => (
        <g className={`key ${code === "ShiftLeft" && shiftLatched ? "is-hovered" : ""}`}
           data-code={code} key={code}
           onMouseDown={() => handleVirtualPress(code)}>
          <rect x={x} y={y} width={w} height={h} className="top" rx="14" ry="14" />
          <rect x={x} y={y} width={w} height={h} fill="none" rx="14" ry="14" />
          <text x={x + w / 2} y={y + h / 2 + 6} textAnchor="middle">
            {code === "Backspace" ? "←" : label}
          </text>
        </g>
      ))}
    </svg>
  );
}
