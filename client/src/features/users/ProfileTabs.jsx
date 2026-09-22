import { useRef } from "react";

export const PROFILE_TABS = [
  { id: "posts", label: "Publicaciones", empty: "No hay publicaciones originales en este perfil." },
  { id: "media", label: "Imágenes", empty: "Todavía no hay imágenes en este perfil." },
  { id: "reposts", label: "Republicaciones", empty: "Todavía no hay republicaciones en este perfil." },
  { id: "saved", label: "Guardados", empty: "No has guardado publicaciones todavía." }
];

export default function ProfileTabs({ value, onChange, isOwnProfile }) {
  const refs = useRef({});
  const tabs = PROFILE_TABS.filter(tab => tab.id !== "saved" || isOwnProfile);
  function onKeyDown(event) {
    const current = tabs.findIndex(tab => tab.id === value);
    let next;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }
  return <div role="tablist" aria-label="Actividad del perfil" className="k-profile-tabs" onKeyDown={onKeyDown}>
    {tabs.map(tab => <button type="button" key={tab.id} ref={element => { refs.current[tab.id] = element; }}
      id={`profile-tab-${tab.id}`} type="button" role="tab" aria-controls="profile-activity-panel"
      aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1}
      className={`k-button ${value === tab.id ? "k-button-primary" : "k-button-secondary"}`}
      onClick={() => onChange(tab.id)}>{tab.label}{tab.id === "saved" && <span className="k-profile-tab-note">Solo tú</span>}</button>)}
  </div>;
}
