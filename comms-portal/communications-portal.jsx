import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, CalendarCheck, FolderOpen, Youtube, BarChart3, Palette, Wrench,
  Menu, X, ChevronRight, ExternalLink, FileText, Users, TrendingUp, Bell, Search,
  ArrowUpRight, CheckCircle2, AlertCircle, Loader2, Copy, Check, Type, MessageSquare,
  BookOpen, Image, Mail, Link2, Download, Megaphone, AlertTriangle, Info, Layers, Eye,
} from "lucide-react";

const B = {
  navy: "#182b3c", navyMid: "#274f73", navyLight: "#1e3a52", steel: "#6d8ba6",
  teal: "#42c3f7", tealDk: "#2da8d8", warm: "#eee6df", warmDk: "#e4dbd3",
  wh: "#ffffff", red: "#8a2e13",
};

const mods = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "events", label: "Events", icon: CalendarCheck },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "tools", label: "Tools", icon: Wrench },
];

function CopyHex({ hex }) {
  const [ok, setOk] = useState(false);
  return <button onClick={() => { navigator.clipboard.writeText(hex); setOk(true); setTimeout(() => setOk(false), 1500); }}
    style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", color: B.steel }}>
    {hex} {ok ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
  </button>;
}

function SH({ icon: Ic, title, sub }) {
  return <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${B.teal}30` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {Ic && <Ic size={20} color={B.teal} />}
      <h3 style={{ fontSize: 18, fontWeight: 700, color: B.navy, margin: 0 }}>{title}</h3>
    </div>
    {sub && <p style={{ fontSize: 13, color: B.steel, margin: "6px 0 0 30px", lineHeight: 1.5 }}>{sub}</p>}
  </div>;
}

function Cd({ children, style = {} }) {
  return <div style={{ background: B.wh, borderRadius: 14, padding: "22px 24px", border: `1px solid ${B.warmDk}`, ...style }}>{children}</div>;
}

function Pill({ children, color = B.teal }) {
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: `${color}18`, color, fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>{children}</span>;
}

function Tip({ children, type = "info" }) {
  const c = { info: B.teal, warn: "#f59e0b", error: B.red }[type];
  const Ic = { info: Info, warn: AlertTriangle, error: AlertCircle }[type];
  return <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderRadius: 10, background: `${c}0c`, borderLeft: `3px solid ${c}`, marginBottom: 14, fontSize: 13, color: B.navy, lineHeight: 1.6 }}>
    <Ic size={16} color={c} style={{ flexShrink: 0, marginTop: 2 }} /><div>{children}</div>
  </div>;
}

function ColorSwatch({ hex, label, rgb, cmyk, isPrimary }) {
  const light = hex === "#eee6df";
  return <div style={{ flex: "1 1 160px", minWidth: 140 }}>
    <div style={{ height: 80, borderRadius: 10, background: hex, marginBottom: 10, border: light ? `1px solid ${B.warmDk}` : "none", boxShadow: "0 4px 12px rgba(24,43,60,0.08)", display: "flex", alignItems: "flex-end", padding: 10 }}>
      <Pill color={light ? B.navy : B.wh}><span style={{ color: light ? B.navy : B.wh }}>{isPrimary ? "Primary" : "Secondary"}</span></Pill>
    </div>
    <div style={{ fontWeight: 600, fontSize: 14, color: B.navy, marginBottom: 4 }}>{label}</div>
    <CopyHex hex={hex} />
    <div style={{ fontSize: 11, color: B.steel, marginTop: 2 }}>RGB: {rgb}</div>
    <div style={{ fontSize: 11, color: B.steel }}>CMYK: {cmyk}</div>
  </div>;
}

function BrandModule() {
  const [tab, setTab] = useState("colors");
  const tabs = [
    { id: "colors", label: "Colors", icon: Palette },
    { id: "typography", label: "Typography", icon: Type },
    { id: "voice", label: "Voice & tone", icon: MessageSquare },
    { id: "language", label: "Language", icon: BookOpen },
    { id: "logos", label: "Logos", icon: Layers },
    { id: "images", label: "Images", icon: Image },
    { id: "templates", label: "Templates", icon: FileText },
    { id: "email", label: "Email", icon: Mail },
    { id: "links", label: "Links", icon: Link2 },
    { id: "comms", label: "Comms team", icon: Megaphone },
  ];
  return <div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
      {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
          border: tab === t.id ? `1.5px solid ${B.teal}` : `1px solid ${B.warmDk}`,
          background: tab === t.id ? `${B.teal}10` : B.wh,
          color: tab === t.id ? B.navy : B.steel, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer" }}>
        <t.icon size={14} /> {t.label}
      </button>)}
    </div>
    <div key={tab} style={{ animation: "fadeIn 0.25s ease" }}>
      {tab === "colors" && <div>
        <SH icon={Palette} title="Color usage" sub="Three primary colors and three secondary colors. Primary colors are most prominent; secondary colors are accents." />
        <Cd style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 0.5 }}>Primary colors</h4>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <ColorSwatch hex="#182b3c" label="Dark Navy" rgb="24 - 43 - 60" cmyk="90 - 74 - 51 - 54" isPrimary />
            <ColorSwatch hex="#274f73" label="Mid Blue" rgb="39 - 79 - 115" cmyk="91 - 69 - 33 - 17" isPrimary />
            <ColorSwatch hex="#6d8ba6" label="Steel Blue" rgb="109 - 139 - 166" cmyk="62 - 38 - 23 - 1" isPrimary />
          </div>
        </Cd>
        <Cd style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 0.5 }}>Secondary colors</h4>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <ColorSwatch hex="#8a2e13" label="Rust Red" rgb="138 - 46 - 19" cmyk="29 - 89 - 100 - 31" />
            <ColorSwatch hex="#eee6df" label="Warm White" rgb="238 - 230 - 223" cmyk="6 - 8 - 10 - 0" />
            <ColorSwatch hex="#42c3f7" label="Teal" rgb="66 - 195 - 247" cmyk="60 - 3 - 0 - 0" />
          </div>
        </Cd>
        <Tip>Teal (#42c3f7) is a <strong>secondary/accent color</strong> — use it for borders, divider strips, and hover states, not as a dominant background.</Tip>
      </div>}

      {tab === "typography" && <div>
        <SH icon={Type} title="Typography (fonts)" sub="Four primary font types for all graphics, promotional materials, and digital spaces." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
          {[{ pill: "Body text", name: "Calibri", desc: "Emails, letters, body text. Sans-serif for accessibility — works with screen readers and OCR." },
            { pill: "Headers & graphics", name: "Century Gothic", desc: "Primary font for graphics, promotional materials, and banner/header images." },
            { pill: "Headers & graphics", name: "League Spartan", desc: "Used alongside Century Gothic. Available on Google Fonts." },
            { pill: "PowerPoint headers", name: "Arial Black", desc: "Used specifically for PowerPoint presentation headers." }].map((f, i) => (
            <Cd key={i}><Pill>{f.pill}</Pill><div style={{ fontSize: 28, fontWeight: 600, color: B.navy, margin: "14px 0 6px" }}>{f.name}</div>
              <p style={{ fontSize: 13, color: B.steel, lineHeight: 1.6, margin: 0 }}>{f.desc}</p></Cd>
          ))}
        </div>
        <Cd>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 12px" }}>Web-specific fonts</h4>
          {[{ p: "Maine.gov (Drupal)", n: "Pre-set. Do not copy-paste from Word — it injects unwanted formatting." },
            { p: "Newsroom (WordPress)", n: "Lato body. Century Gothic / League Spartan for banner graphics." },
            { p: "Email blasts (Mailchimp)", n: "Arial body. Century Gothic / League Spartan for banner graphics." }].map((x, i) => (
            <div key={i} style={{ display: "flex", gap: 12, fontSize: 13, color: B.navy, padding: "6px 0", borderBottom: `1px solid ${B.warmDk}` }}>
              <span style={{ fontWeight: 600, minWidth: 180, flexShrink: 0 }}>{x.p}</span>
              <span style={{ color: B.steel }}>{x.n}</span>
            </div>
          ))}
        </Cd>
      </div>}

      {tab === "voice" && <div>
        <SH icon={MessageSquare} title="Brand & voice" sub="Our voice connects to the values in our vision and mission. Consistent across all communications." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <Cd style={{ borderLeft: "4px solid #22c55e" }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: "#22c55e", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={18} /> Always</h4>
            {["Clear, conversational, and human", "Helpful and solution-oriented", "Friendly yet professional", "Kind, compassionate, and respectful", "Optimistic yet grounded", "Inclusive", "Student-, educator-, and school-centered", "Creative and innovative (when appropriate)"].map((x, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${B.warmDk}`, fontSize: 14, color: B.navy }}>{x}</div>
            ))}
          </Cd>
          <Cd style={{ borderLeft: `4px solid ${B.red}` }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: B.red, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}><X size={18} /> Never</h4>
            {["Overly punitive, harsh, critical, or negative", "Bureaucratic", "Using lots of words when fewer will do", "Jargony", "Exclusive"].map((x, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${B.warmDk}`, fontSize: 14, color: B.navy }}>{x}</div>
            ))}
          </Cd>
        </div>
      </div>}

      {tab === "language" && <div>
        <SH icon={BookOpen} title="Language guidelines" sub="Refer to AP Stylebook for anything not listed. Contact Chloe Teboe for guidance." />
        <Cd style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 14px" }}>Referring to the Maine DOE</h4>
          {[{ l: "Initial", t: '"the Maine Department of Education (DOE)"' }, { l: "Subsequent", t: '"the Maine DOE" or "the department" (lowercase)' }, { l: "Never", t: '"MDOE"', bad: true }].map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 12, fontSize: 13, padding: "4px 0" }}>
              <span style={{ fontWeight: 600, color: r.bad ? B.red : B.navy, minWidth: 90 }}>{r.l}:</span>
              <code style={{ background: `${B.navy}06`, padding: "2px 8px", borderRadius: 4, color: B.steel }}>{r.t}</code>
            </div>
          ))}
        </Cd>
        <Cd style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 14px" }}>Commonly-used conventions</h4>
          {["Oxford comma — always", "One space after a period (not two)", 'Spell out numbers under 10 (e.g., "five")', "Dates: January 1, 2025 (not January 1st)", "Times: 10:30 a.m., 1 p.m., noon, midnight", "MSAD 28, RSU 40 (no #)", "pre-K (hyphenated, lowercase p)"].map((x, i) => (
            <div key={i} style={{ padding: "7px 0", borderBottom: `1px solid ${B.warmDk}`, fontSize: 13, color: B.navy }}>{x}</div>
          ))}
        </Cd>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Cd><h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 12px" }}>Hyphenate</h4>
            {["Cost-effective", "Federally-funded", "In-state", "Limited-period", "Low-income", "One-time", "State-owned", "In-person"].map((w, i) => <div key={i} style={{ fontSize: 13, color: B.navy, padding: "4px 0" }}>{w}</div>)}</Cd>
          <Cd><h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 12px" }}>Do not hyphenate</h4>
            {["Departmentwide", "Ongoing", "Statewide", "Wellbeing"].map((w, i) => <div key={i} style={{ fontSize: 13, color: B.navy, padding: "4px 0" }}>{w}</div>)}</Cd>
        </div>
        <Cd>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 12px" }}>Inclusive language</h4>
          {[{ y: '"schools across Maine"', n: '"Maine schools"' }, { y: '"school administrative unit (SAU)"', n: '"district"' }, { y: '"individuals with a vested interest"', n: '"stakeholder"' }, { y: '"Maine\'s education workforce"', n: '"the field"' }].map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 16, padding: "7px 0", borderBottom: `1px solid ${B.warmDk}`, fontSize: 13 }}>
              <span style={{ flex: 1, color: "#22c55e" }}>✓ {r.y}</span>
              <span style={{ flex: 1, color: B.red }}>✗ {r.n}</span>
            </div>
          ))}
        </Cd>
      </div>}

      {tab === "logos" && <div>
        <SH icon={Layers} title="Logos" sub="Think of a logo like a flag. The Maine DOE logo must always be used." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
          {[{ t: "Official logo (primary)", d: "All official documents, letters, contracts, forms, presentations, promotional materials, and digital spaces." },
            { t: "Informal logo (primary)", d: "When official doesn't fit, square orientation works better, or when scaled very small (good for icons)." },
            { t: "Office/team logos (secondary)", d: "Must be approved by Comms Team. Must use Maine DOE colors/fonts and appear alongside a primary logo." }].map((x, i) => (
            <Cd key={i}><Pill>{i < 2 ? "Primary" : "Secondary"}</Pill>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: B.navy, margin: "10px 0 6px" }}>{x.t}</h4>
              <p style={{ fontSize: 13, color: B.steel, lineHeight: 1.6, margin: 0 }}>{x.d}</p></Cd>
          ))}
        </div>
        <Cd>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 14px" }}>Rules for all logos</h4>
          {["Primary logo required on all official documents, presentations, and digital spaces", "Secondary logos must appear alongside a primary logo", "Never stretch, distort, or blur", "Don't scale down so small words can't be read or oversize relative to other elements", "Don't change coloring without Comms Team approval", "Must have transparent background and high-resolution versions", "Use on backgrounds with enough contrast"].map((r, i) => (
            <div key={i} style={{ padding: "8px 0 8px 14px", borderBottom: `1px solid ${B.warmDk}`, borderLeft: `2px solid ${B.teal}30`, fontSize: 13, color: B.navy, marginBottom: 4 }}>{r}</div>
          ))}
        </Cd>
        <Tip>All logos are in the <strong>DOE Team Logos & Images SharePoint folder</strong>.</Tip>
      </div>}

      {tab === "images" && <div>
        <SH icon={Image} title="Graphics & images" sub="Standards for website, social media, and promotional images." />
        <Cd style={{ marginBottom: 16 }}>
          {[{ r: "All images should be real photographs — no cartoons or clipart.", n: "Exception: icons. Contact Comms Team for custom icons." },
            { r: "High resolution required.", n: "If pixelated, find another. Max 1920×1280 to avoid slow loads." },
            { r: "Never distort images.", n: "Resize proportionally." }].map((x, i) => (
            <div key={i} style={{ padding: "12px 0", borderBottom: i < 2 ? `1px solid ${B.warmDk}` : "none" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: B.navy }}>{x.r}</div>
              <div style={{ fontSize: 12, color: B.steel, marginTop: 4 }}>{x.n}</div>
            </div>
          ))}
        </Cd>
        <Cd><h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 12px" }}>Copyright-compliant sources</h4>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[{ n: "Pexels", u: "https://www.pexels.com/" }, { n: "Pixabay", u: "https://pixabay.com/" }, { n: "Unsplash", u: "https://unsplash.com/" }].map((s, i) => (
              <a key={i} href={s.u} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.warmDk}`, textDecoration: "none", color: B.navy, fontSize: 14, fontWeight: 500 }}>
                <ExternalLink size={14} color={B.teal} /> {s.n}</a>
            ))}
          </div>
        </Cd>
      </div>}

      {tab === "templates" && <div>
        <SH icon={FileText} title="Templates & letterhead" sub="These templates MUST be used for official work. Contact Rachel Paling or Matt Leavitt for access." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
          {[{ n: "Presentation (PowerPoint)", d: "One template with many layout options. Training available." },
            { n: "Letterhead (Word)", d: "For all official letters from the Maine DOE." },
            { n: "Team flyer (Canva)", d: "Branded one-page handout for office, team, or initiative." }].map((t, i) => (
            <Cd key={i}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><Pill color="#22c55e">Self-serve</Pill><Download size={16} color={B.steel} /></div>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: B.navy, margin: "0 0 6px" }}>{t.n}</h4>
              <p style={{ fontSize: 13, color: B.steel, lineHeight: 1.5, margin: 0 }}>{t.d}</p></Cd>
          ))}
        </div>
        <Cd><h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 14px" }}>Comms team creates these for you</h4>
          {["Newsletters (Mailchimp) — customizable template with analytics", "Newsroom article graphics — standard social media graphic", "Employment opportunity graphics — 'We are hiring!' promotions", "YouTube thumbnails — standard branded thumbnail", "Microsoft Forms branding — background and logo"].map((x, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${B.warmDk}`, fontSize: 13, color: B.navy }}>{x}</div>
          ))}
        </Cd>
      </div>}

      {tab === "email" && <div>
        <SH icon={Mail} title="Email signature policy" sub="All staff must follow official formatting for email signatures and out-of-office messages." />
        <Cd style={{ marginBottom: 16 }}>
          {["12pt, Calibri, black font", "Lead with Maine DOE logo, then team logo if applicable", "No quotes, backgrounds, or extra info", "One additional link allowed after Maine DOE Newsroom (pipe-separated)"].map((r, i) => (
            <div key={i} style={{ fontSize: 13, color: B.navy, padding: "6px 0", borderBottom: `1px solid ${B.warmDk}` }}>• {r}</div>
          ))}
        </Cd>
        <Cd><h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 14px" }}>Example</h4>
          <div style={{ padding: 20, background: B.warm, borderRadius: 10, fontFamily: "Calibri, sans-serif", fontSize: 13, lineHeight: 1.8, color: "#000" }}>
            <div style={{ borderTop: `2px solid ${B.steel}`, width: 200, marginBottom: 14 }} />
            <strong>Matthew Leavitt</strong> (He/Him)<br />Website & Technology Coordinator<br />Maine Department of Education<br />
            23 State House Station<br />Augusta, Maine 04333-0023<br />
            <strong>Email:</strong> <span style={{ color: B.teal }}>matthew.g.leavitt@maine.gov</span><br />
            <strong>Phone:</strong> 207-355-4615<br />
            <span style={{ color: B.teal }}>Maine DOE</span> | <span style={{ color: B.teal }}>Facebook</span> | <span style={{ color: B.teal }}>Instagram</span> | <span style={{ color: B.teal }}>Maine DOE Newsroom</span>
          </div>
        </Cd>
      </div>}

      {tab === "links" && <div>
        <SH icon={Link2} title="Links" sub="Key rules for using links on the website, newsletters, and other spaces." />
        <Cd>{[
          { r: "Vet all links", d: "Check accuracy. Avoid for-profit articles or resources." },
          { r: "Always use HTTPS", d: "Ensures a secure connection for visitors." },
          { r: "Don't copy from Outlook", d: "Click the link first, copy from browser address bar." },
          { r: "Use descriptive text", d: 'Don\'t use "click here" or "link."' },
          { r: "Keep URLs short", d: "Use URL shortening tools for long links." },
          { r: "QR codes for print only", d: "Not for digital. Canva has a generator." },
          { r: "Hyperlink full descriptions", d: "Link meaningful phrases, not bare URLs." },
          { r: "Disclaimer for external resources", d: '"Organizations and resources included are for reference only. They are not an endorsement from the Maine Department of Education."' },
        ].map((x, i) => <div key={i} style={{ padding: "12px 0", borderBottom: `1px solid ${B.warmDk}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: B.navy }}>{x.r}</div>
          <div style={{ fontSize: 13, color: B.steel, marginTop: 3, lineHeight: 1.5 }}>{x.d}</div>
        </div>)}</Cd>
      </div>}

      {tab === "comms" && <div>
        <SH icon={Megaphone} title="Involving the Communications Team" sub="When should you involve us? Early and often!" />
        <Tip>Bring the Communications Team in at the ground level of any project. This will save you time and energy!</Tip>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <Cd style={{ borderLeft: "4px solid #22c55e" }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: "#22c55e", margin: "0 0 12px" }}>Please do</h4>
            {["Bring us in at the ground level", "Invite us to first planning meetings", "Share goals so we can strategize together", "Contact us early and often", "Adhere to the Brand Guide", "Use appropriate workflows"].map((x, i) =>
              <div key={i} style={{ padding: "6px 0", fontSize: 13, color: B.navy }}>✓ {x}</div>)}
          </Cd>
          <Cd style={{ borderLeft: `4px solid ${B.red}` }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: B.red, margin: "0 0 12px" }}>Please do not</h4>
            {["Wait until you send us a Newsroom post", "Use just one tactic to achieve your goal", "Ask for content without providing context", "Talk to the press without approval", "Plan events without informing us"].map((x, i) =>
              <div key={i} style={{ padding: "6px 0", fontSize: 13, color: B.navy }}>✗ {x}</div>)}
          </Cd>
        </div>
        <Tip type="warn">Submit to the <strong>Communications Workflow at least two weeks</strong> before you want content posted or sent.</Tip>
        <Cd><h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 14px" }}>Communications materials</h4>
          {[{ t: "Priority notice", d: "Targeted message to specific audience via Mailchimp" },
            { t: "Administrative letter", d: "New/changed laws or regulations — multi-step approval" },
            { t: "Newsroom article", d: "Professional learning, school highlights, grants — posted on Newsroom" },
            { t: "Media advisory", d: "Press invitations to cover Maine DOE events" },
            { t: "Media release", d: "Announcements and news for press and wider audience" },
            { t: "Maine DOE Update", d: "Weekly Friday newsletter with all Newsroom articles" },
            { t: "Social media", d: "Facebook, Instagram, LinkedIn promotions" }].map((x, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${B.warmDk}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: B.navy }}>{x.t}</div>
              <div style={{ fontSize: 12, color: B.steel, marginTop: 3 }}>{x.d}</div>
            </div>
          ))}
        </Cd>
      </div>}
    </div>
  </div>;
}

/* ── Analytics Module ──────────────────────── */
function AnalyticsModule() {
  const [tab, setTab] = useState("overview");
  const [dateRange, setDateRange] = useState("30");
  const [pageSearch, setPageSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw98yVhSSYfD2HhJGilZBYYE_dc_R9lY4ZKNxmRRyzHXVvQdVyPkBg_iYXDcAygSkqnTQ/exec";
  const DRUPAL_API = "https://www.maine.gov/doe/jsonapi/node/multi_column_page";
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageData, setPageData] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [ownerMap, setOwnerMap] = useState({});
  const [owners, setOwners] = useState([]);
  const [drupalLoaded, setDrupalLoaded] = useState(false);
  const [error, setError] = useState(null);

  const demoPages = [
    { path: "/doe/certification", title: "Educator Certification", views: 4218, users: 3102, avg: "2:14" },
    { path: "/doe/funding", title: "School Funding", views: 3891, users: 2847, avg: "1:58" },
    { path: "/doe/schools/schoolnutrition", title: "School Nutrition", views: 2764, users: 1983, avg: "3:02" },
    { path: "/doe/learning/career-tech", title: "Career & Technical Education", views: 2341, users: 1822, avg: "2:45" },
    { path: "/doe/specialservices", title: "Special Services", views: 2108, users: 1654, avg: "2:31" },
    { path: "/doe/schools/safeschools", title: "Safe & Healthy Schools", views: 1876, users: 1321, avg: "1:44" },
    { path: "/doe/learning/adult-education", title: "Adult Education", views: 1654, users: 1198, avg: "2:19" },
    { path: "/doe/data-reporting", title: "Data & Reporting", views: 1543, users: 1087, avg: "3:15" },
    { path: "/doe/calendar", title: "Event Calendar", views: 1432, users: 1105, avg: "1:32" },
    { path: "/doe/learning/instruction", title: "Interdisciplinary Instruction", views: 1287, users: 943, avg: "2:08" },
    { path: "/doe/assessment", title: "Assessment", views: 1156, users: 887, avg: "2:42" },
    { path: "/doe/eddev", title: "Educator Development", views: 1032, users: 798, avg: "1:55" },
    { path: "/doe/highered", title: "Higher Education", views: 987, users: 721, avg: "2:33" },
    { path: "/doe/earlylearning", title: "Early Learning", views: 932, users: 689, avg: "2:11" },
    { path: "/doe/migrant", title: "Title I, Part C – Highly Mobile Students", views: 843, users: 612, avg: "3:08" },
  ];
  const demoFiles = [
    { file: "School-Nutrition-Application-2026.pdf", page: "/doe/schools/schoolnutrition", clicks: 342, lastClick: "2 hours ago" },
    { file: "Certification-Renewal-Form.pdf", page: "/doe/certification", clicks: 289, lastClick: "4 hours ago" },
    { file: "EPS-Funding-Summary-FY26.pdf", page: "/doe/funding", clicks: 234, lastClick: "Yesterday" },
    { file: "CTE-Program-Standards.pdf", page: "/doe/learning/career-tech", clicks: 187, lastClick: "Yesterday" },
    { file: "IEP-Compliance-Guide.pdf", page: "/doe/specialservices", clicks: 156, lastClick: "2 days ago" },
    { file: "Adult-Ed-Provider-List.pdf", page: "/doe/learning/adult-education", clicks: 134, lastClick: "3 days ago" },
    { file: "School-Safety-Checklist.pdf", page: "/doe/schools/safeschools", clicks: 112, lastClick: "3 days ago" },
    { file: "Data-Collection-Calendar.xlsx", page: "/doe/data-reporting", clicks: 98, lastClick: "Last week" },
    { file: "Assessment-Schedule-2026.pdf", page: "/doe/assessment", clicks: 87, lastClick: "Last week" },
    { file: "Migrant-Ed-Brochure.pdf", page: "/doe/migrant", clicks: 76, lastClick: "Last week" },
  ];

  // Enrich pages with owner data
  const rawPages = pageData || demoPages;
  const pages = rawPages.map(p => ({ ...p, owner: ownerMap[p.path] || ownerMap[p.path.replace(/\/$/, "")] || "" }));
  const files = fileData || demoFiles;
  const totalViews = pages.reduce((s, p) => s + p.views, 0);
  const totalUsers = pages.reduce((s, p) => s + p.users, 0);
  const totalDownloads = files.reduce((s, f) => s + f.clicks, 0);

  const filteredPages = pages.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(pageSearch.toLowerCase()) || p.path.toLowerCase().includes(pageSearch.toLowerCase()) || (p.owner && p.owner.toLowerCase().includes(pageSearch.toLowerCase()));
    const matchesOwner = !ownerFilter || p.owner === ownerFilter;
    return matchesSearch && matchesOwner;
  });
  const filteredFiles = files.filter(f => f.file.toLowerCase().includes(fileSearch.toLowerCase()) || f.page.toLowerCase().includes(fileSearch.toLowerCase()));

  // Fetch page owners from Drupal JSON:API
  async function fetchDrupalOwners() {
    const map = {};
    const ownerSet = new Set();
    let url = `${DRUPAL_API}?fields[node--multi_column_page]=title,path,field_page_owner_email&page[limit]=50`;
    let pageNum = 0;
    try {
      while (url && pageNum < 40) {
        const res = await fetch(url.replace(/^http:/, "https:"));
        const json = await res.json();
        if (json.data) {
          json.data.forEach(node => {
            const alias = node.attributes?.path?.alias;
            const ownerEmail = node.attributes?.field_page_owner_email;
            if (alias && ownerEmail) {
              const ownerName = ownerEmail.split("@")[0].split(".").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
              map[alias] = ownerName;
              map["/doe" + alias] = ownerName;
              ownerSet.add(ownerName);
            }
          });
        }
        url = json.links?.next?.href || null;
        pageNum++;
      }
    } catch (e) {
      console.log("Drupal JSON:API fetch failed (may be CORS):", e.message);
    }
    setOwnerMap(map);
    setOwners(Array.from(ownerSet).sort());
    setDrupalLoaded(true);
  }

  async function fetchData(days) {
    setLoading(true); setError(null);
    try {
      const [pRes, fRes] = await Promise.all([
        fetch(`${SCRIPT_URL}?type=pages&days=${days || dateRange}`),
        fetch(`${SCRIPT_URL}?type=files&days=${days || dateRange}`),
      ]);
      const pData = await pRes.json();
      const fData = await fRes.json();
      if (pData.error) throw new Error(pData.error);
      setPageData(pData.rows || []);
      setFileData(fData.rows || []);
      setConnected(true);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); fetchDrupalOwners(); }, []);

  function changePeriod(d) { setDateRange(d); fetchData(d); }

  const dateLabels = { "7": "7 days", "30": "30 days", "90": "90 days", "180": "6 months", "365": "1 year" };
  const topPages = pages.slice(0, 10);
  const maxViews = topPages.length > 0 ? topPages[0].views : 1;
  const topFiles = files.slice(0, 8);
  const maxClicks = topFiles.length > 0 ? topFiles[0].clicks : 1;

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "pages", label: "All pages", icon: Eye },
    { id: "files", label: "File downloads", icon: Download },
    { id: "setup", label: "Setup", icon: Wrench },
  ];

  return <div>
    {/* Status bar */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {connected ? <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: "#22c55e14", fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} /> Live
        </div> : <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: `${B.teal}14`, fontSize: 12, fontWeight: 600, color: B.tealDk }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: B.teal }} /> Preview data
        </div>}
        {loading && <Loader2 size={16} color={B.teal} style={{ animation: "spin 1s linear infinite" }} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {Object.entries(dateLabels).map(([d, label]) => (
          <button key={d} onClick={() => changePeriod(d)}
            style={{ padding: "6px 14px", borderRadius: 8, border: dateRange === d ? `1.5px solid ${B.teal}` : `1px solid ${B.warmDk}`,
              background: dateRange === d ? `${B.teal}10` : B.wh, color: dateRange === d ? B.navy : B.steel,
              fontSize: 12, fontWeight: dateRange === d ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>
    </div>

    {error && <div style={{ padding: "12px 16px", borderRadius: 10, background: `${B.red}0c`, borderLeft: `3px solid ${B.red}`, marginBottom: 16, fontSize: 13, color: B.red }}>{error}</div>}

    {/* Tab bar */}
    <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
      {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
          border: tab === t.id ? `1.5px solid ${B.teal}` : `1px solid ${B.warmDk}`,
          background: tab === t.id ? `${B.teal}10` : B.wh,
          color: tab === t.id ? B.navy : B.steel, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: "pointer" }}>
        <t.icon size={14} /> {t.label}
      </button>)}
    </div>

    <div key={`${tab}-${dateRange}`} style={{ animation: "fadeIn 0.25s ease" }}>

      {/* ── OVERVIEW TAB ────────────────────── */}
      {tab === "overview" && <div>
        {/* Metric cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Page views", value: totalViews.toLocaleString(), icon: Eye, color: B.teal },
            { label: "Unique users", value: totalUsers.toLocaleString(), icon: Users, color: B.navyMid },
            { label: "File downloads", value: totalDownloads.toLocaleString(), icon: Download, color: "#22c55e" },
            { label: "Pages tracked", value: pages.length.toString(), icon: FileText, color: B.steel },
            { label: "Files tracked", value: files.length.toString(), icon: FolderOpen, color: "#f59e0b" },
          ].map((m, i) => (
            <div key={i} style={{ background: B.wh, borderRadius: 14, padding: "20px 22px", border: `1px solid ${B.warmDk}`, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 14, right: 16, opacity: 0.12 }}><m.icon size={36} color={m.color} /></div>
              <div style={{ fontSize: 11, color: B.steel, textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: B.navy, lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: 11, color: B.steel, marginTop: 6 }}>Last {dateLabels[dateRange]}</div>
            </div>
          ))}
        </div>

        {/* Two-column: Top Pages + Top Downloads */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
          {/* Top Pages bar chart */}
          <Cd>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: B.navy, margin: 0 }}>Top pages</h4>
              <button onClick={() => setTab("pages")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: B.teal, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                View all <ChevronRight size={12} />
              </button>
            </div>
            {topPages.map((p, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: B.navy, fontWeight: 500, maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                  <span style={{ color: B.steel, fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>{p.views.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: `${B.navy}08`, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${B.navy}, ${B.navyMid})`, width: `${(p.views / maxViews) * 100}%`, transition: "width 0.5s ease" }} />
                </div>
              </div>
            ))}
          </Cd>

          {/* Top Downloads bar chart */}
          <Cd>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: B.navy, margin: 0 }}>Top downloads</h4>
              <button onClick={() => setTab("files")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: B.teal, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                View all <ChevronRight size={12} />
              </button>
            </div>
            {topFiles.map((f, i) => {
              const shortName = f.file.length > 30 ? f.file.substring(0, 27) + "..." : f.file;
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: B.navy, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                      <Download size={11} color={B.teal} /> {shortName}
                    </span>
                    <span style={{ color: B.steel, fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>{f.clicks.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#22c55e10", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #22c55e, #16a34a)", width: `${(f.clicks / maxClicks) * 100}%`, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
            {topFiles.length === 0 && <div style={{ textAlign: "center", padding: 30, color: B.steel, fontSize: 13 }}>No file download data yet. The Drupal JS snippet needs time to collect clicks.</div>}
          </Cd>
        </div>

        {/* Pages by engagement - full width table */}
        <Cd style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.warmDk}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: B.navy, margin: 0 }}>All pages ranked by views</h4>
            <span style={{ fontSize: 12, color: B.steel }}>{pages.length} pages</span>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: `${B.navy}06`, position: "sticky", top: 0 }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: B.navy, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>#</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: B.navy, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Page</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: B.navy, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Owner</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: B.navy, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Views</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: B.navy, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Users</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: B.navy, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Avg. time</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: B.navy, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Share</th>
              </tr></thead>
              <tbody>{pages.map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${B.warmDk}` }}
                  onMouseEnter={e => e.currentTarget.style.background = `${B.teal}06`}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px 16px", color: B.steel, fontWeight: 600, fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500, color: B.navy }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: B.steel, fontFamily: "monospace", marginTop: 2 }}>{p.path}</div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {p.owner ? <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, background: `${B.navyMid}10`, color: B.navyMid, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{p.owner}</span> : <span style={{ fontSize: 11, color: `${B.steel}80` }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: B.navy }}>{p.views.toLocaleString()}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: B.steel }}>{p.users.toLocaleString()}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: B.steel }}>{p.avg}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      <div style={{ width: 50, height: 6, borderRadius: 3, background: `${B.navy}08`, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: B.teal, width: `${(p.views / totalViews) * 100}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: B.steel, fontFamily: "monospace", minWidth: 36, textAlign: "right" }}>{(p.views / totalViews * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Cd>
      </div>}

      {/* ── ALL PAGES TAB ───────────────────── */}
      {tab === "pages" && <div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: B.wh, borderRadius: 10, border: `1px solid ${B.warmDk}`, flex: 1, minWidth: 250 }}>
            <Search size={16} color={B.steel} />
            <input type="text" placeholder="Search by title, URL, or owner..." value={pageSearch} onChange={e => setPageSearch(e.target.value)}
              style={{ border: "none", outline: "none", flex: 1, fontSize: 14, color: B.navy, background: "transparent" }} />
            {pageSearch && <button onClick={() => setPageSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: B.steel }}><X size={14} /></button>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 0 14px", background: B.wh, borderRadius: 10, border: `1px solid ${B.warmDk}` }}>
            <Users size={14} color={B.steel} />
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
              style={{ border: "none", outline: "none", fontSize: 13, color: ownerFilter ? B.navy : B.steel, background: "transparent", padding: "10px 8px", cursor: "pointer", minWidth: 140 }}>
              <option value="">All owners</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {ownerFilter && <button onClick={() => setOwnerFilter("")} style={{ background: "none", border: "none", cursor: "pointer", color: B.steel, padding: "0 8px" }}><X size={14} /></button>}
          </div>
          {drupalLoaded && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: B.steel, padding: "0 8px" }}>
            <CheckCircle2 size={12} color="#22c55e" /> {Object.keys(ownerMap).length > 0 ? `${owners.length} owners loaded` : "No owner data found"}
          </div>}
        </div>
        <Cd style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: B.navy, color: B.wh }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Page</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Owner</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>Views</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>Users</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>Avg. time</th>
              </tr></thead>
              <tbody>{filteredPages.map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${B.warmDk}` }}
                  onMouseEnter={e => e.currentTarget.style.background = `${B.teal}06`}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 500, color: B.navy }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: B.steel, marginTop: 2, fontFamily: "monospace" }}>{p.path}</div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {p.owner ? <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: `${B.navyMid}10`, color: B.navyMid, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}
                      onClick={() => setOwnerFilter(p.owner)}>{p.owner}</span> : <span style={{ fontSize: 11, color: `${B.steel}80` }}>—</span>}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 600, color: B.navy }}>{p.views.toLocaleString()}</td>
                  <td style={{ padding: "14px 16px", textAlign: "right", color: B.steel }}>{p.users.toLocaleString()}</td>
                  <td style={{ padding: "14px 16px", textAlign: "right", color: B.steel }}>{p.avg}</td>
                </tr>
              ))}
              {filteredPages.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: B.steel }}>No pages match your search.</td></tr>}
              </tbody>
            </table>
          </div>
        </Cd>
      </div>}

      {/* ── FILE DOWNLOADS TAB ──────────────── */}
      {tab === "files" && <div>
        <Tip>File download tracking requires a JavaScript snippet on your Drupal site. See the <strong>Setup</strong> tab for instructions.</Tip>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: B.wh, borderRadius: 10, border: `1px solid ${B.warmDk}`, marginBottom: 16 }}>
          <Search size={16} color={B.steel} />
          <input type="text" placeholder="Search files by name or page..." value={fileSearch} onChange={e => setFileSearch(e.target.value)}
            style={{ border: "none", outline: "none", flex: 1, fontSize: 14, color: B.navy, background: "transparent" }} />
          {fileSearch && <button onClick={() => setFileSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: B.steel }}><X size={14} /></button>}
        </div>
        <Cd style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: B.navy, color: B.wh }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>File</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Linked from</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>Downloads</th>
              </tr></thead>
              <tbody>{filteredFiles.map((f, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${B.warmDk}` }}
                  onMouseEnter={e => e.currentTarget.style.background = `${B.teal}06`}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "14px 16px" }}><div style={{ fontWeight: 500, color: B.navy, display: "flex", alignItems: "center", gap: 6 }}><Download size={14} color={B.teal} /> {f.file}</div></td>
                  <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 11, color: B.steel }}>{f.page}</td>
                  <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 600, color: B.navy }}>{f.clicks.toLocaleString()}</td>
                </tr>
              ))}
              {filteredFiles.length === 0 && <tr><td colSpan={3} style={{ padding: 30, textAlign: "center", color: B.steel }}>No files match your search.</td></tr>}
              </tbody>
            </table>
          </div>
        </Cd>
      </div>}

      {/* ── SETUP TAB ───────────────────────── */}
      {tab === "setup" && <div>
        <SH icon={Wrench} title="Analytics setup" sub="Three steps to connect live GA4 data to this portal." />
        <Cd style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: B.navy, color: B.wh, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>1</div>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: B.navy, margin: 0 }}>Google Cloud service account</h4>
          </div>
          <div style={{ paddingLeft: 38, fontSize: 13, color: B.steel, lineHeight: 1.8 }}>
            <div>Go to <span style={{ color: B.teal, fontWeight: 500 }}>console.cloud.google.com</span> → New Project → Enable "Google Analytics Data API" → Create Service Account → Download JSON key → Add service account email as Viewer in GA4 Admin.</div>
          </div>
        </Cd>
        <Cd style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: B.navy, color: B.wh, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>2</div>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: B.navy, margin: 0 }}>Deploy the Google Apps Script proxy</h4>
          </div>
          <div style={{ paddingLeft: 38, fontSize: 13, color: B.steel, lineHeight: 1.8 }}>
            <div>Go to <span style={{ color: B.teal, fontWeight: 500 }}>script.google.com</span> → New Project → Paste the proxy code → Set Script Properties (GA4_PROPERTY_ID, SA_EMAIL, SA_PRIVATE_KEY) → Deploy as Web App (Execute as: Me, Access: Anyone).</div>
          </div>
        </Cd>
        <Cd style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: B.navy, color: B.wh, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>3</div>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: B.navy, margin: 0 }}>Add file download tracking to Drupal</h4>
          </div>
          <div style={{ paddingLeft: 38, fontSize: 13, color: B.steel, lineHeight: 1.8 }}>
            <div>Add the <code style={{ background: `${B.navy}08`, padding: "2px 6px", borderRadius: 4 }}>drupal-file-download-tracking.js</code> snippet to your Drupal JS Injector. It fires a <code style={{ background: `${B.navy}08`, padding: "2px 6px", borderRadius: 4 }}>file_download</code> GA4 event on clicks to PDFs, DOCX, XLSX, PPTX, CSV, and ZIP files.</div>
          </div>
        </Cd>
        <Cd>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: B.navy, margin: "0 0 6px" }}>Connection status</h4>
          <div style={{ fontSize: 13, color: B.steel, marginBottom: 12 }}>The portal automatically connects on load using the configured Apps Script URL.</div>
          {connected ? <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 10, background: "#22c55e0c", border: "1px solid #22c55e30", fontSize: 13, color: "#16a34a", fontWeight: 500 }}>
            <CheckCircle2 size={16} /> Connected — showing live GA4 data
          </div> : <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 10, background: `${B.teal}0c`, border: `1px solid ${B.teal}30`, fontSize: 13, color: B.tealDk, fontWeight: 500 }}>
            <Info size={16} /> {error ? `Connection failed: ${error}` : "Attempting to connect..."}
          </div>}
        </Cd>
      </div>}
    </div>
  </div>;
}

function StatCard({ icon: Ic, label, value, sub, accent = B.teal }) {
  return <div style={{ background: B.wh, borderRadius: 14, padding: "22px 24px", display: "flex", alignItems: "flex-start", gap: 16, border: `1px solid ${B.warmDk}` }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(24,43,60,0.08)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic size={22} color={accent} /></div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, color: B.steel, letterSpacing: 0.3, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: B.navy, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: B.steel, marginTop: 4 }}>{sub}</div>}
    </div>
  </div>;
}

function ActivityRow({ icon: Ic, text, time, status }) {
  const c = { done: "#22c55e", pending: B.teal, alert: B.red }[status];
  const SI = status === "done" ? CheckCircle2 : status === "alert" ? AlertCircle : Loader2;
  return <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${B.warmDk}` }}>
    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${B.navy}0c`, display: "flex", alignItems: "center", justifyContent: "center" }}><Ic size={16} color={B.steel} /></div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, color: B.navy, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</div>
      <div style={{ fontSize: 12, color: B.steel, marginTop: 2 }}>{time}</div>
    </div>
    <SI size={18} color={c} style={status === "pending" ? { animation: "spin 2s linear infinite" } : undefined} />
  </div>;
}

function ModulePlaceholder({ module }) {
  const mod = mods.find(m => m.id === module);
  const Ic = mod?.icon || LayoutDashboard;
  const desc = { events: "Track event form submissions from intake to calendar publication.", files: "Browse every file, see where it's linked, submit deletion requests.", youtube: "Track video submissions, processing status, and channel stats.", analytics: "Self-serve page view reports and file download tracking.", tools: "WCAG tools, content audit, dead link checker, and workflows." };
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, textAlign: "center", padding: 40 }}>
    <div style={{ width: 80, height: 80, borderRadius: 20, background: `linear-gradient(135deg, ${B.navy}, ${B.navyMid})`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, boxShadow: "0 8px 32px rgba(24,43,60,0.15)" }}><Ic size={36} color={B.teal} /></div>
    <h2 style={{ fontSize: 24, fontWeight: 700, color: B.navy, margin: "0 0 8px" }}>{mod?.label}</h2>
    <p style={{ fontSize: 15, color: B.steel, maxWidth: 440, lineHeight: 1.6, margin: 0 }}>{desc[module]}</p>
    <div style={{ marginTop: 32, padding: "10px 24px", borderRadius: 8, background: `${B.teal}14`, color: B.tealDk, fontSize: 13, fontWeight: 600 }}>Coming soon</div>
  </div>;
}

function DashboardHome({ onNavigate }) {
  const subs = { events: "Submissions + calendar", files: "Inventory + delete requests", youtube: "Videos + channel stats", analytics: "Page views + downloads", brand: "Logos + templates", tools: "WCAG + workflows" };
  return <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
      <StatCard icon={FileText} label="Site pages" value="~1,500" sub="Drupal multi-column pages" />
      <StatCard icon={Youtube} label="Videos" value="1,678" sub="Public YouTube videos" accent="#FF0000" />
      <StatCard icon={Users} label="Staff" value="18" sub="Content contributors" accent={B.navyMid} />
      <StatCard icon={TrendingUp} label="Monthly views" value="—" sub="GA4 integration pending" accent="#22c55e" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div style={{ background: B.wh, borderRadius: 14, padding: "20px 24px", border: `1px solid ${B.warmDk}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: B.navy, margin: 0 }}>Recent activity</h3><Bell size={16} color={B.steel} />
        </div>
        <ActivityRow icon={CalendarCheck} text="Spring Career Fair submitted for calendar" time="2 hours ago" status="pending" />
        <ActivityRow icon={Youtube} text="CTE Showcase 2026 video published" time="Yesterday" status="done" />
        <ActivityRow icon={FileText} text="Migrant Ed brochure deletion requested" time="Yesterday" status="alert" />
        <ActivityRow icon={BarChart3} text="Certification page hit 4,200 views this month" time="3 days ago" status="done" />
      </div>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: B.navy, margin: "0 0 16px" }}>Quick links</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[{ l: "Submit a calendar event", i: CalendarCheck }, { l: "Submit a YouTube video", i: Youtube }, { l: "Request a file deletion", i: FolderOpen }, { l: "View brand guidelines", i: Palette }, { l: "WCAG remediation tools", i: Wrench }].map((x, i) => (
            <div key={i} onClick={() => x.l.includes("brand") ? onNavigate("brand") : null} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: B.wh, borderRadius: 10, border: `1px solid ${B.warmDk}`, color: B.navy, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
              <x.i size={16} color={B.teal} /><span style={{ flex: 1 }}>{x.l}</span><ArrowUpRight size={14} color={B.steel} />
            </div>
          ))}
        </div>
      </div>
    </div>
    <h3 style={{ fontSize: 16, fontWeight: 700, color: B.navy, margin: "36px 0 16px" }}>Portal modules</h3>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
      {mods.filter(m => m.id !== "dashboard").map(m => (
        <div key={m.id} onClick={() => onNavigate(m.id)}
          style={{ background: B.wh, borderRadius: 12, padding: "20px 18px", border: `1px solid ${B.warmDk}`, cursor: "pointer", transition: "transform 0.15s, border-color 0.15s", display: "flex", flexDirection: "column", gap: 10 }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = B.teal; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = B.warmDk; }}>
          <m.icon size={22} color={B.teal} />
          <div><div style={{ fontSize: 15, fontWeight: 600, color: B.navy }}>{m.label}</div>
            <div style={{ fontSize: 12, color: B.steel, marginTop: 2 }}>{subs[m.id]}</div></div>
          <ChevronRight size={16} color={B.steel} style={{ alignSelf: "flex-end", marginTop: "auto" }} />
        </div>
      ))}
    </div>
  </div>;
}

export default function CommsPortal() {
  const [active, setActive] = useState("dashboard");
  const [sbOpen, setSbOpen] = useState(true);
  const [mob, setMob] = useState(false);

  useEffect(() => {
    const ck = () => { const m = window.innerWidth < 860; setMob(m); if (m) setSbOpen(false); };
    ck(); window.addEventListener("resize", ck); return () => window.removeEventListener("resize", ck);
  }, []);

  const nav = useCallback((id) => { setActive(id); if (mob) setSbOpen(false); }, [mob]);

  return <div style={{ display: "flex", height: "100vh", fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Calibri, sans-serif', background: B.warm, color: B.navy, overflow: "hidden" }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:${B.steel}40;border-radius:3px}*{box-sizing:border-box;margin:0}`}</style>

    {mob && sbOpen && <div onClick={() => setSbOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(24,43,60,0.4)", zIndex: 40 }} />}

    <aside style={{
      width: sbOpen ? 240 : 68, flexShrink: 0, background: `linear-gradient(180deg, ${B.navy}, ${B.navyLight})`,
      display: "flex", flexDirection: "column", transition: "width 0.25s", overflow: "hidden", zIndex: 50,
      ...(mob ? { position: "fixed", left: sbOpen ? 0 : -240, top: 0, bottom: 0, width: 240 } : {})
    }}>
      <div style={{ padding: sbOpen ? "20px 20px 16px" : "20px 12px 16px", borderBottom: `1px solid ${B.navyMid}40`, display: "flex", alignItems: "center", gap: 12, minHeight: 68 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${B.teal}, ${B.tealDk})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, fontWeight: 800, color: B.wh }}>ME</div>
        {sbOpen && <div><div style={{ fontSize: 14, fontWeight: 700, color: B.wh }}>Communications</div><div style={{ fontSize: 11, color: B.steel }}>Maine DOE Web Portal</div></div>}
      </div>
      <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
        {mods.map(m => {
          const a = active === m.id;
          return <div key={m.id} onClick={() => nav(m.id)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: sbOpen ? "11px 14px" : "11px 0", justifyContent: sbOpen ? "flex-start" : "center", borderRadius: 10, marginBottom: 4, cursor: "pointer", background: a ? `${B.teal}18` : "transparent", position: "relative" }}>
            {a && <div style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: B.teal }} />}
            <m.icon size={20} color={a ? B.teal : B.steel} style={{ flexShrink: 0 }} />
            {sbOpen && <span style={{ fontSize: 14, fontWeight: a ? 600 : 400, color: a ? B.wh : B.steel }}>{m.label}</span>}
          </div>;
        })}
      </nav>
      {sbOpen && <div style={{ padding: "16px 20px", borderTop: `1px solid ${B.navyMid}40`, fontSize: 11, color: B.steel, lineHeight: 1.5 }}>Maine Department of Education<br /><span style={{ opacity: 0.6 }}>Website & Technology</span></div>}
    </aside>

    <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ height: 64, padding: "0 28px", display: "flex", alignItems: "center", gap: 16, background: B.wh, borderBottom: `1px solid ${B.warmDk}`, flexShrink: 0 }}>
        <button onClick={() => setSbOpen(!sbOpen)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", color: B.navy }}>
          {sbOpen && mob ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: B.navy, flex: 1 }}>{mods.find(m => m.id === active)?.label}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: B.warm, borderRadius: 8, border: `1px solid ${B.warmDk}`, color: B.steel, fontSize: 13 }}>
          <Search size={14} /><span>Search portal...</span>
        </div>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
        <div key={active} style={{ animation: "fadeIn 0.3s ease", maxWidth: 1100 }}>
          {active === "dashboard" && <DashboardHome onNavigate={nav} />}
          {active === "brand" && <BrandModule />}
          {active === "analytics" && <AnalyticsModule />}
          {!["dashboard", "brand", "analytics"].includes(active) && <ModulePlaceholder module={active} />}
        </div>
      </div>
    </main>
  </div>;
}
