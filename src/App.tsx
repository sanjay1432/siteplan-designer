import { useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronRight, CircleHelp, DraftingCompass, Layers3, Mail, Ruler, ShieldCheck } from "lucide-react";
import { SitePlanEditor } from "./components/editor/SitePlanEditor";
import "./App.css";

const features = [
  { icon: Ruler, title: "Parcel boundaries", text: "Edit an edge length or drag its corner. Split or remove points, or import ordered survey points from CSV in feet, metres, or millimetres." },
  { icon: Layers3, title: "Setbacks and site features", text: "Set a setback for each parcel edge. Add, size, move, and label features such as buildings, parking, paths, trees, utilities, and easements." },
  { icon: DraftingCompass, title: "Rooms and floor plans", text: "Start with a 1, 2, or 3 BHK layout, or add rooms yourself. Arrange rooms, add doors and windows, and create multiple floors." },
  { icon: ShieldCheck, title: "3D view and project reports", text: "Orbit an interactive 3D model of the site, setbacks and every floor, with walls, doors and windows. Export an editable JSON backup or print a project report and save it as PDF." },
];
const steps = [
  { number: "01", title: "Define the parcel", text: "In Site Properties, edit a side length or drag a corner. To import a survey, choose a CSV with ordered X/Y or Easting/Northing points." },
  { number: "02", title: "Lay out the site", text: "Set each edge’s setback, add site features, then generate a room layout or add rooms. Arrange them on the plan and add doors or windows." },
  { number: "03", title: "Review and export", text: "Check the 2D plan and 3D view. Projects autosave in this browser; export JSON to move a project or print a project report." },
];

function Header({ active }: { active?: "app" | "contact" }) {
  return <header className="public-header"><a className="brand" href="/" aria-label="SitePlan Designer home"><span className="brand-mark"><DraftingCompass size={20}/></span><span>SitePlan Designer</span></a><nav>{active === "contact" ? <a className="nav-cta" href="/app">Open planner <ArrowRight size={15}/></a> : <a href="/contact">Contact</a>}</nav></header>;
}

function Footer() { return <footer className="public-footer"><a className="brand" href="/"><span className="brand-mark"><DraftingCompass size={17}/></span><span>SitePlan Designer</span></a></footer>; }

function LandingPage() {
  return <div className="public-page"><Header/><main>
    <section className="landing-hero"><div className="hero-copy"><div className="eyebrow"> A free site planning workspace</div><h1>Make room for<br/><em>what’s next.</em></h1><p className="hero-lede">From the first boundary line to a finished site plan. Draw to scale, try out your ideas, and see how the pieces fit.</p><div className="hero-actions"><a className="primary-action" href="/app">Open the free planner <ArrowRight size={17}/></a><a className="text-action" href="#how-it-works">See how it works <ChevronRight size={16}/></a></div><div className="trust-row"><span><Check size={14}/> Free, always</span><span><Check size={14}/> No account needed</span><span><Check size={14}/> Saved in this browser</span></div></div>
      <div className="hero-art" aria-label="Illustrated site plan workspace"><div className="art-top"><span><i/> <i/> <i/></span><span>PROJECT / UNTITLED SITE</span><span>100′ × 100′</span></div><div className="art-canvas"><div className="art-ruler">N&nbsp; ↑</div><svg viewBox="0 0 560 370" role="img" aria-label="A parcel and building footprint drawn to scale"><defs><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d8ded7"/></pattern></defs><rect width="560" height="370" fill="url(#dots)"/><path className="parcel-draw" d="M102 72 L430 92 L408 300 L86 279 Z" fill="#e9efe6" stroke="#476e55" strokeWidth="2.5"/><path className="setback-draw" d="M138 106 L392 119 L375 265 L125 249 Z" fill="none" stroke="#a9bba7" strokeWidth="1.5" strokeDasharray="5 5"/><path className="building-pop" d="M195 144 L323 151 L313 222 L187 215 Z" fill="#fff" stroke="#284b38" strokeWidth="2"/><path d="M258 148 L254 219 M191 180 L318 187" stroke="#9aa79a" strokeWidth="1.5"/><path d="M103 58 L430 78 M95 61 l8 -5 M430 78 l-8 5" stroke="#737d71" strokeWidth="1"/><text x="240" y="48" fill="#596458" fontSize="12" fontFamily="sans-serif">58′ 0″</text><path d="M448 93 L426 300 M445 98 l6 1 M429 300 l-6 -1" stroke="#737d71" strokeWidth="1"/><text x="464" y="203" fill="#596458" fontSize="12" fontFamily="sans-serif" transform="rotate(96 464 203)">65′ 0″</text><circle className="parcel-node node-one" cx="102" cy="72" r="4" fill="#fff" stroke="#476e55" strokeWidth="2"/><circle className="parcel-node node-two" cx="430" cy="92" r="4" fill="#fff" stroke="#476e55" strokeWidth="2"/><circle className="parcel-node node-three" cx="408" cy="300" r="4" fill="#fff" stroke="#476e55" strokeWidth="2"/><circle className="parcel-node node-four" cx="86" cy="279" r="4" fill="#fff" stroke="#476e55" strokeWidth="2"/><text x="228" y="184" fill="#526252" fontSize="11" fontFamily="sans-serif" letterSpacing="1">BUILDING</text></svg><div className="art-chip"><span className="chip-dot"/><span>Parcel area</span><strong>3,588 sq ft</strong></div><div className="art-side"><span>BOUNDARY</span><b>58′</b><b>59′</b><b>58′</b><b>65′</b></div></div><div className="art-bottom"><span>● 2D PLAN</span><span>Saved locally <ShieldCheck size={13}/></span></div></div>
      <div className="hero-note"><span className="note-icon"><ShieldCheck size={17}/></span><span><strong>Your work stays yours</strong><small>Projects are saved in this browser.</small></span></div>
    </section>
    <section className="feature-section" id="how-it-works"><div className="section-heading"><span className="eyebrow">Features</span><h2>Tools for the whole site plan.</h2><p>See what you can build and export in the editor.</p></div><div className="feature-grid">{features.map(({icon:Icon,title,text},i)=><article className="feature-card" key={title} style={{"--card-index":i} as React.CSSProperties}><span className="feature-number">0{i+1}</span><span className="feature-icon"><Icon size={20}/></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="steps-section"><div className="steps-heading"><span className="eyebrow">How it works</span><h2>Start with the site. Build from there.</h2></div><div className="steps-grid">{steps.map((step,i)=><article className="step-card" key={step.number} style={{"--step-index":i} as React.CSSProperties}><span className="step-number">{step.number}</span><span className="step-connector" aria-hidden="true"/><h3>{step.title}</h3><p>{step.text}</p></article>)}</div><p className="workflow-note">Projects are stored in this browser. Survey CSV coordinates are treated as a local grid; latitude/longitude reprojection is not supported.</p></section>
  </main><Footer/></div>;
}

function ContactPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("bot-field")) { setStatus("sent"); return; }
    setStatus("sending");
    try {
      const body = new URLSearchParams();
      for (const [key, value] of data.entries()) if (typeof value === "string") body.append(key, value);
      const response = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!response.ok) throw new Error("Contact form submission failed");
      setStatus("sent"); form.reset();
    } catch { setStatus("error"); }
  }
  return <div className="public-page"><Header active="contact"/><main className="contact-main"><div className="contact-intro"><span className="eyebrow"><CircleHelp size={14}/> Contact</span><h1>Help improve<br/><em>the planner.</em></h1><p>Report a problem, request an update, or share feedback. Include enough detail for us to understand what you need.</p><div className="contact-promise"><Mail size={18}/><span><strong>Send a message to the team</strong><small>Include your email so we can reply.</small></span></div><div className="contact-aside"><span className="aside-line"/><p>SitePlan Designer is free to use. Your message helps us keep it useful for everyone.</p></div></div>
    <section className="contact-card"><div className="contact-card-head"><span>CONTACT FORM</span></div>{status === "sent" ? <div className="form-success" role="status"><span className="success-check"><Check size={23}/></span><h2>Message received.</h2><p>Thanks for helping improve SitePlan Designer. We’ll take a look.</p><button className="text-action" onClick={()=>setStatus("idle")}>Send another message <ArrowRight size={15}/></button></div> : <form name="contact" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" onSubmit={handleSubmit}>
      <input type="hidden" name="form-name" value="contact"/><div className="honeypot" aria-hidden="true"><label>Leave this field empty<input name="bot-field" tabIndex={-1} autoComplete="off"/></label></div>
      <label className="field-label">Your name <span>Required</span><input name="name" autoComplete="name" minLength={2} maxLength={80} required placeholder="How should we address you?"/></label>
      <label className="field-label">Email address <span>Required</span><input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/></label>
      <label className="field-label">What’s this about? <span>Required</span><select name="topic" required defaultValue=""><option value="" disabled>Select a topic</option><option>Report an issue</option><option>Request an update</option><option>Share an idea</option><option>Something else</option></select></label>
      <label className="field-label">Your message <span>Required</span><textarea name="message" minLength={10} maxLength={3000} required rows={5} placeholder="Tell us what happened or what you’d like to see…"/></label>
      {status === "error" && <p className="form-error" role="alert">We couldn’t send your message. Please try again in a moment.</p>}
      <button className="primary-action submit-action" type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send message"}<ArrowRight size={16}/></button><p className="form-footnote">Your email is only used to reply to this message.</p>
    </form>}</section></main><Footer/></div>;
}

function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/app") return <SitePlanEditor/>;
  if (path === "/contact") return <ContactPage/>;
  return <LandingPage/>;
}

export default App;
