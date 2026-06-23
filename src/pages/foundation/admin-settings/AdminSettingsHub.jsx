/* =========================================================================
   AdminSettingsHub — Nexus by MSI · Foundation › Admin Settings
   Card grid of every settings category. Available cards navigate; Roadmap
   cards are disabled with a "Segera Hadir" tooltip. Hover lift + orange
   accent bar + arrow slide.
   ========================================================================= */

import { useState } from "react";
import { Icon, PageHeader, SectionLabel, Tooltip, KitStyles } from "./kit";
import { SURFACE, NAVY, LINE, ORANGE, FAINT, INK, INK_SOFT, MUTED, FONT_BODY, FONT_HEAD, FONT_MONO } from "./tokens";

const HUB_GROUPS = [
  {
    title: "Konfigurasi Inti",
    cards: [
      { id: "entity",   icon: "building2", name: "Entity Settings",     desc: "Profil perusahaan, rekening bank, penanda tangan.", status: "available" },
      { id: "document", icon: "filetext",  name: "Document Settings",   desc: "Skema penomoran & template dokumen.",              status: "available" },
      { id: "finance",  icon: "coins",     name: "Finance Defaults",    desc: "Konfigurasi pajak, mata uang, termin pembayaran.", status: "available" },
      { id: "approval", icon: "gitbranch", name: "Approval Workflows",  desc: "Rantai persetujuan per jenis dokumen & HRGA.",     status: "available" },
      { id: "notif",    icon: "bell",      name: "Notifications",       desc: "Aturan notifikasi in-app & email.",                status: "available" },
    ],
  },
  {
    title: "Keamanan & Sistem",
    cards: [
      { id: "security",  icon: "shield",     name: "Security Policy",      desc: "Kebijakan kata sandi, sesi & 2FA.",       status: "available" },
      { id: "audit",     icon: "clipboard",  name: "Audit Log",            desc: "Riwayat aktivitas sistem.",               status: "available" },
      { id: "general",   icon: "settings",   name: "General Preferences",  desc: "Lokalisasi, format & tampilan.",          status: "available" },
      { id: "integrate", icon: "plug",       name: "Integrations",         desc: "Konektor eksternal & API key.",           status: "available" },
      { id: "dropdown-mgmt", icon: "layers", name: "Dropdown Management",   desc: "Daftar pilihan referensi lintas modul.",  status: "available" },
    ],
  },
];

function HubCard({ card, onOpen }) {
  const [h, setH] = useState(false);
  const available = card.status === "available";
  const inner = (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={() => available && onOpen(card.id)}
      style={{
        position: "relative", background: SURFACE, border: "1px solid " + (available && h ? NAVY : LINE),
        borderRadius: 16, padding: "22px 22px 20px 24px", cursor: available ? "pointer" : "not-allowed",
        overflow: "hidden", transition: "border-color .2s ease, box-shadow .2s ease, transform .2s ease",
        transform: available && h ? "translateY(-2px)" : "none",
        boxShadow: available && h ? "0 10px 28px rgba(20,40,70,.1)" : "0 1px 2px rgba(20,40,70,.03)",
        opacity: available ? 1 : 0.78, height: "100%",
      }}>
      {/* left accent bar */}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: ORANGE, transform: available && h ? "scaleY(1)" : "scaleY(0)", transformOrigin: "center", transition: "transform .25s cubic-bezier(.22,1,.36,1)" }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ width: 50, height: 50, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 50px", background: available ? (h ? NAVY : "#EAF0F8") : "#EFEBE2", color: available ? (h ? "#fff" : NAVY) : FAINT, transition: "all .25s" }}>
          <Icon name={card.icon} size={24} />
        </div>
        {available ? (
          <span style={{ display: "inline-flex", alignItems: "center", fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: "#fff", background: NAVY, borderRadius: 20, padding: "4px 11px", letterSpacing: 0.2 }}>Tersedia</span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 500, color: FAINT, background: LINE, borderRadius: 20, padding: "4px 11px" }}>Roadmap</span>
        )}
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: available ? NAVY : INK_SOFT, marginTop: 16, letterSpacing: -0.2 }}>{card.name}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 1.5, textWrap: "pretty" }}>{card.desc}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 18, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, color: available ? (h ? ORANGE : NAVY) : FAINT, transition: "color .2s" }}>
        {available ? (
          <>
            Buka pengaturan
            <span style={{ display: "inline-flex", transform: h ? "translateX(4px)" : "none", transition: "transform .25s cubic-bezier(.22,1,.36,1)" }}><Icon name="arrowright" size={15} /></span>
          </>
        ) : (
          <><Icon name="lock" size={13} />Segera hadir</>
        )}
      </div>
    </div>
  );
  if (available) return inner;
  return <Tooltip label="Segera hadir — sedang dalam pengembangan" side="top">{inner}</Tooltip>;
}

export default function AdminSettingsHub({ onOpen }) {
  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings" }]}
        title="Admin Settings"
        subtitle="Pusat konfigurasi sistem · hanya untuk Super Admin & Admin"
        right={<span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 20, background: "#EAF0F8", color: NAVY, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600 }}><Icon name="shield" size={15} />Akses Terbatas</span>}
      />

      {HUB_GROUPS.map((group, gi) => (
        <div key={group.title} style={{ marginBottom: gi === 0 ? 34 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <SectionLabel>{group.title}</SectionLabel>
            <span style={{ flex: 1, height: 1, background: LINE }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600, color: FAINT }}>
              {group.cards.length} {group.title === "Roadmap" ? "menyusul" : "tersedia"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {group.cards.map((c) => <HubCard key={c.id} card={c} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
