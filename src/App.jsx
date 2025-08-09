import { useEffect, useRef, useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";
import Typewriter from "./Typewriter";

/* ========= Crypto helpers (AES-GCM) ========= */
const enc = new TextEncoder();
const dec = new TextDecoder();

const toBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result.split(",")[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });

async function generateAesKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function exportKeyB64(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64(raw);
}
async function importKeyB64(b64) {
  return crypto.subtle.importKey("raw", fromBase64(b64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = enc.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  return { iv: toBase64(iv), ciphertext: toBase64(ct), alg: "AES-GCM", v: 1 };
}
async function decryptJson(key, obj) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(obj.iv) }, key, fromBase64(obj.ciphertext));
  return JSON.parse(dec.decode(pt));
}

/* ========= Local schedule store ========= */
const LS_KEY = "tc_schedules_v1"; // [{id, deliverAtISO, keyB64, fileName, descKey?, ownerName?, ownerBirthday?, revealedAt}]
const loadSchedules = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
};
const saveSchedules = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

function App() {
  const [message, setMessage] = useState("");

  // Flexible delay parts
  const [years, setYears] = useState(0);
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);

  // Audio
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recordingError, setRecordingError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Last-created info (optional testing panel)
  const [lastKeyB64, setLastKeyB64] = useState("");
  const [lastDownloadName, setLastDownloadName] = useState("");

  // Decrypt UI
  const [decFile, setDecFile] = useState(null);
  const [decKeyB64, setDecKeyB64] = useState("");
  const [decResult, setDecResult] = useState(null);
  const [decError, setDecError] = useState("");

  // Local schedules list
  const [schedules, setSchedules] = useState(loadSchedules());
  const [nowTick, setNowTick] = useState(Date.now());

  // MediaRecorder refs
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Textarea ref
  const textareaRef = useRef(null);

  // Creator info
  const [creatorName, setCreatorName] = useState("");
  const [birthday, setBirthday] = useState(""); // YYYY-MM-DD

  // Search gate for schedules
  const [searchName, setSearchName] = useState("");
  const [searchBirthday, setSearchBirthday] = useState("");

  const normalize = (s) => (s || "").trim().toLowerCase();
  const matchesUser = (sch, n, b) =>
    normalize(sch.ownerName) === normalize(n) &&
    normalize(sch.ownerBirthday) === normalize(b);

  function generateDescKey() {
    const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const pick = () => ALPH[Math.floor(Math.random() * ALPH.length)];
    const s = Array.from({ length: 6 }, pick).join("");
    return `${s.slice(0, 3)}-${s.slice(3)}`;
  }
  function sanitize(s) {
    return (s || "").trim().replace(/\s+/g, "-").replace(/[^a-z0-9\-_.]/gi, "");
  }

  /* ======= Audio Recording ======= */
  const chooseMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const t of types) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  };

  const startRecording = async () => {
    try {
      setRecordingError(""); setElapsed(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = chooseMimeType();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data?.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        stopTimer(); stopStream();
      };
      mr.start(); setIsRecording(true); startTimer();
    } catch (err) {
      console.error(err);
      setRecordingError("Microphone permission denied or unavailable.");
      stopStream(); setIsRecording(false);
    }
  };

  const stopStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    else { stopStream(); stopTimer(); }
    setIsRecording(false);
  };

  const startTimer = () => {
    stopTimer(); timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  /* ======= Effects ======= */
  useEffect(() => {
    return () => {
      stopTimer(); stopStream();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // heartbeat for countdown display
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // persist schedules
  useEffect(() => { saveSchedules(schedules); }, [schedules]);

  /* ======= Typing helpers ======= */
  const insertAtCursor = (val) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessage((s) => (val === "\b" ? s.slice(0, -1) : s + val));
      return;
    }
    const start = ta.selectionStart ?? message.length;
    const end = ta.selectionEnd ?? message.length;

    setMessage((prev) => {
      if (val === "\b") {
        if (start !== end) {
          const next = prev.slice(0, start) + prev.slice(end);
          queueMicrotask(() => { ta.focus(); ta.setSelectionRange(start, start); });
          return next;
        }
        if (start > 0) {
          const next = prev.slice(0, start - 1) + prev.slice(end);
          const pos = start - 1;
          queueMicrotask(() => { ta.focus(); ta.setSelectionRange(pos, pos); });
          return next;
        }
        queueMicrotask(() => ta.focus());
        return prev;
      }

      const next = prev.slice(0, start) + val + prev.slice(end);
      const pos = start + val.length;
      queueMicrotask(() => { ta.focus(); ta.setSelectionRange(pos, pos); });
      return next;
    });
  };

  const handleVirtualKey = (val) => insertAtCursor(val);

  useEffect(() => {
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    };

    const onKeyDown = (e) => {
      if (isEditable(document.activeElement)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Backspace") { e.preventDefault(); insertAtCursor("\b"); return; }
      if (e.key === "Enter")     { e.preventDefault(); insertAtCursor("\n"); return; }
      if (e.key === " ")         { e.preventDefault(); insertAtCursor(" ");  return; }

      if (e.key && e.key.length === 1) {
        e.preventDefault();
        insertAtCursor(e.key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ======= Handlers ======= */
  const onUploadAudioFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioBlob(file);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
  };

  const totalDelayMs = () => {
    const y = Math.max(0, Number.isFinite(+years) ? +years : 0);
    const d = Math.max(0, Number.isFinite(+days) ? +days : 0);
    const h = Math.max(0, Number.isFinite(+hours) ? +hours : 0);
    const m = Math.max(0, Number.isFinite(+minutes) ? +minutes : 0);
    const MIN = 60 * 1000;
    const H = 60 * MIN, D = 24 * H, Y = 365 * D; // simple approximations
    return y * Y + d * D + h * H + m * MIN;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const ms = totalDelayMs();
      if (ms <= 0) {
        alert("Please enter a delay greater than zero (years/days/hours/minutes).");
        return;
      }
      if (!creatorName || !birthday) {
        alert("Please enter your name and birthday.");
        return;
      }

      // bundle to encrypt
      let audioB64 = null;
      if (audioBlob) audioB64 = await blobToBase64(audioBlob);
      const bundle = {
        v: 1,
        createdAt: new Date().toISOString(),
        name: creatorName,
        birthday, // YYYY-MM-DD
        message,
        audio: audioB64 ? { mime: audioBlob.type || "application/octet-stream", b64: audioB64 } : null,
      };

      // key + encrypt
      const key = await generateAesKey();
      const keyB64 = await exportKeyB64(key);
      const encObj = await encryptJson(key, bundle);

      // desc key + file name
      const descKey = generateDescKey();
      const safeName = sanitize(creatorName);
      const safeBday = sanitize(birthday);
      const fileName = `CTTF-${safeName}_${safeBday}_${Date.now()}.enc.json`;

      // download
      const fileBlob = new Blob([JSON.stringify(encObj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(fileBlob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);

      setLastKeyB64(keyB64);
      setLastDownloadName(fileName);

      // schedule (store owner info for search-gate)
      const deliverAtISO = new Date(Date.now() + ms).toISOString();
      const id = `tc_${Date.now()}`;
      setSchedules((prev) => [
        ...prev,
        {
          id,
          deliverAtISO,
          keyB64,
          fileName,
          descKey,
          ownerName: creatorName,
          ownerBirthday: birthday,
          revealedAt: null
        }
      ]);

      alert("Encrypted & downloaded. The key and description key will appear when the timer hits zero.");

      setMessage("");
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(""); setElapsed(0);
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Check console.");
    }
  };

  const handleDecFile = (e) => {
    const f = e.target.files?.[0];
    setDecResult(null); setDecError("");
    if (!f) return;
    setDecFile(f);
  };

  const handleDecrypt = async () => {
    setDecResult(null); setDecError("");
    try {
      if (!decFile || !decKeyB64) {
        setDecError("Please provide both the encrypted file and the key.");
        return;
      }
      const text = await decFile.text();
      const encObj = JSON.parse(text);
      const key = await importKeyB64(decKeyB64.trim());
      const result = await decryptJson(key, encObj);
      setDecResult(result);
    } catch (err) {
      console.error(err);
      setDecError("Decryption failed. Check your key and file.");
    }
  };

  /* ======= UI helpers ======= */
  const mmss = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const fmtCountdown = (iso) => {
    const t = Math.max(0, Math.floor((new Date(iso).getTime() - nowTick) / 1000));
    const d = Math.floor(t / 86400);
    const h = Math.floor((t % 86400) / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const revealIfDue = (sch) => {
    const due = Date.now() >= new Date(sch.deliverAtISO).getTime();
    if (due && !sch.revealedAt) {
      const updated = schedules.map((x) => (x.id === sch.id ? { ...x, revealedAt: new Date().toISOString() } : x));
      setSchedules(updated);
      return { ...sch, revealedAt: new Date().toISOString() };
    }
    return sch;
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <img src={reactLogo} alt="App icon" className="favicon" />
        <span className="logo-text">Cache to the Future</span>
      </header>

      {/* Main */}
      <main className="app-main">
        <h1 className="page-title">Enter your message!</h1>

        <form className="contact-form" onSubmit={handleSubmit}>
          {/* Name & Birthday */}
          <label htmlFor="creatorName">Your name</label>
          <input
            id="creatorName"
            type="text"
            placeholder="e.g., Hana Tanaka"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            required
          />

          <label htmlFor="birthday">Birthday</label>
          <input
            id="birthday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            required
          />

          <label htmlFor="message">Your message</label>

          {/* Keyboard */}
          <div className="typewriter-wrapper">
            <Typewriter onVirtualKey={handleVirtualKey} />
          </div>

          <textarea
            id="message"
            ref={textareaRef}
            placeholder="Write your thoughts here…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />

          {/* Jump link for long pages */}
          <button
            type="button"
            className="btn ghost"
            onClick={() => document.getElementById("decrypt")?.scrollIntoView({ behavior: "smooth" })}
            style={{ alignSelf: "flex-start", marginTop: "8px" }}
          >
            ↓ Scroll to Decrypt
          </button>

          {/* Flexible Deliver After */}
          <div className="delivery-row delivery-grid">
            <span className="delivery-label">Deliver after</span>

            <div className="num-field">
              <label htmlFor="years">Years</label>
              <input
                id="years"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={years}
                onChange={(e) => setYears(+e.target.value)}
              />
            </div>

            <div className="num-field">
              <label htmlFor="days">Days</label>
              <input
                id="days"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(+e.target.value)}
              />
            </div>

            <div className="num-field">
              <label htmlFor="hours">Hours</label>
              <input
                id="hours"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={hours}
                onChange={(e) => setHours(+e.target.value)}
              />
            </div>

            <div className="num-field">
              <label htmlFor="minutes">Minutes</label>
              <input
                id="minutes"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(+e.target.value)}
              />
            </div>
          </div>

          {/* Audio + Submit on the same line */}
          <div className="audio-row">
            <div className="audio-controls">
              {!isRecording ? (
                <button type="button" className="btn record" onClick={startRecording} aria-pressed="false">
                  ● Start recording
                </button>
              ) : (
                <button type="button" className="btn stop" onClick={stopRecording} aria-pressed="true">
                  ■ Stop ({mmss(elapsed)})
                </button>
              )}
              <span className="audio-hint">or</span>
              <label className="btn file">
                Upload audio
                <input type="file" accept="audio/*" onChange={onUploadAudioFile} hidden />
              </label>
            </div>

            <button type="submit" className="submit-wide">Encrypt & Schedule</button>
          </div>

          {recordingError && <div className="audio-error">{recordingError}</div>}

          {audioUrl && (
            <div className="audio-preview">
              <audio controls src={audioUrl} />
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setAudioBlob(null);
                  if (audioUrl) URL.revokeObjectURL(audioUrl);
                  setAudioUrl(""); setElapsed(0);
                }}
              >
                Remove audio
              </button>
            </div>
          )}

          {lastKeyB64 && lastDownloadName && (
            <div className="key-hint">
              <div><strong>Last key created:</strong> <code>{lastKeyB64}</code></div>
              <div><strong>File:</strong> <code>{lastDownloadName}</code></div>
            </div>
          )}
        </form>

        {/* Search-gated schedules */}
        <section className="decrypt-card">
          <h2 className="section-title">Find your scheduled capsule</h2>

          <div className="decrypt-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Your name (e.g., Hana Tanaka)"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              style={{ flex: "1 1 220px" }}
            />
            <input
              type="date"
              value={searchBirthday}
              onChange={(e) => setSearchBirthday(e.target.value)}
              style={{ flex: "0 0 180px" }}
            />
          </div>

          <div className="sched-list">
            {schedules
              .filter((s) => searchName && searchBirthday && matchesUser(s, searchName, searchBirthday))
              .map((s) => {
                const s2 = revealIfDue(s);
                const due = Date.now() >= new Date(s2.deliverAtISO).getTime();
                return (
                  <div key={s2.id} className="sched-item">
                    <div className="sched-meta">
                      <div><strong>Owner:</strong> {s2.ownerName || "—"}</div>
                      <div><strong>Birthday:</strong> {s2.ownerBirthday || "—"}</div>
                      <div><strong>Unlocks at:</strong> {new Date(s2.deliverAtISO).toLocaleString()}</div>
                      <div><strong>File:</strong> {s2.fileName}</div>
                    </div>

                    <div className="sched-controls">
                      {(due || s2.revealedAt) ? (
                        <>
                          <div className="key-line">
                            <strong>Key:</strong> <code>{s2.keyB64}</code>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => navigator.clipboard.writeText(s2.keyB64)}
                            >
                              Copy
                            </button>
                          </div>
                          {s2.descKey && (
                            <div className="key-line">
                              <strong>Description key:</strong> <code>{s2.descKey}</code>
                              <button
                                className="btn"
                                type="button"
                                onClick={() => navigator.clipboard.writeText(s2.descKey)}
                              >
                                Copy
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="muted">Keys hidden until unlock time.</div>
                      )}

                      {/* Always-visible countdown */}
                      <div className="countdown subtle" style={{ marginTop: 6 }}>
                        {due ? "Unlocked" : `Opens in: ${fmtCountdown(s2.deliverAtISO)}`}
                      </div>

                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setSchedules(schedules.filter((x) => x.id !== s2.id))}
                        style={{ marginTop: 8 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* Empty states */}
            {(!searchName || !searchBirthday) && (
              <div className="muted">Enter your name and birthday to find your capsule.</div>
            )}
            {searchName && searchBirthday &&
              schedules.filter((s) => matchesUser(s, searchName, searchBirthday)).length === 0 && (
                <div className="muted">No capsule found for that name & birthday.</div>
              )}
          </div>
        </section>

        {/* Decrypt section */}
        <section id="decrypt" className="decrypt-card">
          <h2 className="section-title">Decrypt your time capsule</h2>
          <div className="decrypt-row">
            <label className="btn file">
              Choose encrypted file
              <input type="file" accept=".json,.enc" onChange={handleDecFile} hidden />
            </label>
            <input
              className="key-input"
              type="text"
              placeholder="Paste decryption key (base64)"
              value={decKeyB64}
              onChange={(e) => setDecKeyB64(e.target.value)}
            />
            <button className="btn" type="button" onClick={handleDecrypt}>Decrypt</button>
          </div>
          {decError && <div className="audio-error">{decError}</div>}
          {decResult && (
            <div className="decrypt-output">
              <div><strong>Message:</strong></div>
              <pre className="msg-pre">{decResult.message}</pre>
              {decResult.audio?.b64 && (
                <a
                  className="btn"
                  href={`data:${decResult.audio.mime};base64,${decResult.audio.b64}`}
                  download="timecapsule-audio"
                >
                  Download audio
                </a>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <img src={reactLogo} alt="App icon" className="favicon" />
        <span className="logo-text">Cache to the Future</span>
      </footer>
    </div>
  );
}

export default App;
