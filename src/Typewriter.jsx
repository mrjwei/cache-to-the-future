import { useEffect, useMemo, useRef } from "react";
import "./typewriter.css";

export default function Typewriter() {
  const svgRef = useRef(null);

  // --- layout config ---
  const keyW = 70;
  const keyH = 70;
  const gap  = 12;
  const startX = 40;
  const startY = 40;
  const rowIndent = 36; // A-row and Z-row stagger

  // QWERTY rows (letters only)
  const rows = useMemo(
    () => [
      ["Q","W","E","R","T","Y","U","I","O","P"], // r=0, indent=0
      ["A","S","D","F","G","H","J","K","L"],     // r=1, indent=rowIndent
      ["Z","X","C","V","B","N","M"],             // r=2, indent=rowIndent*2
    ],
    []
  );

  // helpers to compute widths/positions
  const rowWidthPx = (rIndex) => {
    const len = rows[rIndex].length;
    const indent = rIndex * rowIndent;
    return indent + len * keyW + (len - 1) * gap;
  };

  const topWidth    = rowWidthPx(0);
  const middleWidth = rowWidthPx(1);
  const bottomWidth = rowWidthPx(2);

  // ENTER key size/pos: sits to the RIGHT of the middle (home) row, spanning two rows
  const enterW = keyW + gap * 2;       // slightly wider than a normal key
  const enterH = keyH * 2 + gap;       // spans two rows (top & middle)
  const enterX =
    startX +
    // right edge of middle row:
    (rowIndent * 1) + rows[1].length * keyW + (rows[1].length - 1) * gap +
    // one gap of separation before the Enter block:
    gap;
  const enterY = startY;

  // SPACE key size/pos: centered under the whole keyboard
  const spaceW = keyW * 5 + gap * 4;   // wide bar
  const spaceH = keyH;
  // widest content must consider "middle row + Enter" (usually the widest)
  const contentW = Math.max(topWidth, middleWidth + gap + enterW, bottomWidth);
  const spaceX = startX + (contentW - spaceW) / 2;
  const spaceY = startY + 3 * (keyH + gap); // below Z row

  // Precompute letter key rects
  const letterKeys = useMemo(() => {
    const out = [];
    rows.forEach((rowLetters, r) => {
      const indent = r * rowIndent;
      const y = startY + r * (keyH + gap);
      rowLetters.forEach((letter, i) => {
        const x = startX + indent + i * (keyW + gap);
        out.push({ label: letter, code: `Key${letter}`, x, y, w: keyW, h: keyH });
      });
    });
    return out;
  }, [rows]);

  // special keys
  const specialKeys = [
    { label: "ENTER", code: "Enter", x: enterX, y: enterY, w: enterW, h: enterH },
    { label: "SPACE", code: "Space", x: spaceX, y: spaceY, w: spaceW, h: spaceH },
  ];

  // final viewBox
  const vbWidth  = startX * 2 + contentW;
  const vbHeight = startY * 2 + (3 * keyH) + (2 * gap) + spaceH + gap; // 3 rows + gaps + spacebar

  // hover/press effects
  useEffect(() => {
    const root = svgRef.current;
    if (!root) return;

    const keyMap = new Map(
      [...root.querySelectorAll(".key")].map((el) => [el.dataset.code, el])
    );
    const setHover = (code, on) => {
      const el = keyMap.get(code);
      if (el) el.classList.toggle("is-hovered", on);
    };
    const setActive = (code, on) => {
      const el = keyMap.get(code);
      if (el) el.classList.toggle("is-active", on);
    };
    const onDown = (e) => { if (!e.repeat) { setHover(e.code, true); setActive(e.code, true); } };
    const onUp   = (e) => { setActive(e.code, false); setTimeout(() => setHover(e.code, false), 70); };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${vbWidth} ${vbHeight}`}
      role="img"
      aria-label="Typewriter Keyboard"
    >
      <defs>
        <linearGradient id="gradTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#232833" />
          <stop offset="100%" stopColor="#1b1e24" />
        </linearGradient>
      </defs>

      {/* letters */}
      {letterKeys.map(({ label, code, x, y, w, h }) => (
        <g className="key" data-code={code} key={code}>
          <rect x={x} y={y} width={w} height={h} className="top" rx="10" ry="10" />
          <rect x={x} y={y} width={w} height={h} fill="none" rx="10" ry="10" />
          <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle">{label}</text>
        </g>
      ))}

      {/* enter + space */}
      {specialKeys.map(({ label, code, x, y, w, h }) => (
        <g className="key" data-code={code} key={code}>
          <rect x={x} y={y} width={w} height={h} className="top" rx="12" ry="12" />
          <rect x={x} y={y} width={w} height={h} fill="none" rx="12" ry="12" />
          <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle">{label}</text>
        </g>
      ))}
    </svg>
  );
}
