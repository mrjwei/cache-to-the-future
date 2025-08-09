import { useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";

function App() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ email, message });
    alert("Submitted! Check console for data.");
    setEmail("");
    setMessage("");
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
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="message">Your message</label>
          <textarea
            id="message"
            placeholder="Write your thoughts here…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />

          <button type="submit">Submit</button>
        </form>
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
