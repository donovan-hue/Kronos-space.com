/**
 * DEMO LOCAL — Proyectos, Plantillas y Versiones.
 *
 * Monta las tres pantallas reales con sus hojas de estilo reales, pero con
 * un almacén en memoria en lugar de Mongo. Nada de esto entra en la app:
 * solo se abre con `npm run demo` (client) o /demo.html en el servidor de
 * desarrollo de Vite.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { createTestQueryClient } from "../src/app/queryClient";
import { ToastProvider } from "../src/components/feedback/ToastProvider";
import { ConfirmProvider } from "../src/components/feedback/ConfirmProvider";
import ProjectsPage from "../src/features/projects/ProjectsPage";
import ProjectBoard from "../src/features/projects/ProjectBoard";
import TemplatesPage from "../src/features/projects/TemplatesPage";
import { api } from "../src/services/apiClient";
import { PLANTILLAS } from "../src/features/projects/templates";

// La demo utiliza la misma entrada CSS, sin copiar su orden.
import "../src/styles/app.css";
import "./demo.css";

// --- almacén en memoria -------------------------------------------------
const AYER = Date.parse("2026-10-20T18:30:00Z");
const HOY = Date.parse("2026-10-21T09:00:00Z");
let seq = 0;
const id = (prefijo) => `${prefijo}${String(++seq).padStart(4, "0")}`;

const escena = (order, title, script, mediaUrl = "") => ({
  _id: id("s"),
  order,
  title,
  script,
  mediaUrl,
  mediaType: mediaUrl ? "video" : ""
});

const conPlantilla = (plantillaId, titulo) => {
  const plantilla = PLANTILLAS.find((item) => item.id === plantillaId);
  return {
    _id: id("p"),
    title: titulo,
    brief: "Pieza de demostración con datos de ejemplo. Todo se puede editar y guardar.",
    format: plantilla.format,
    scenes: plantilla.escenas.map((item) => escena(item.order, item.title, item.script)),
    musicTitle: "",
    musicUrl: "",
    versions: [],
    archived: false,
    createdAt: AYER,
    updatedAt: AYER
  };
};

const proyectos = [
  (() => {
    const proyecto = conPlantilla("reel", "Lanzamiento de la app");
    proyecto.scenes[1].script = "Por qué importa: hoy el guion, las tomas y la música viven en tres sitios.";
    proyecto.musicTitle = "Pulso lento";
    proyecto.musicUrl = ""; // No fingir un MP3 que no existe; el usuario puede añadir su enlace.
    proyecto.versions = [
      {
        _id: id("v"),
        label: "Primer corte",
        createdAt: AYER,
        snapshot: {
          label: "Primer corte",
          title: proyecto.title,
          brief: proyecto.brief,
          format: proyecto.format,
          musicTitle: "Pulso lento",
          musicUrl: proyecto.musicUrl,
          scenes: [
            escena(0, "Gancho", "¿Cuántas veces grabaste el mismo reel desde cero?"),
            escena(1, "Contexto", "El guion en una nota, las tomas en el teléfono, la música en otro lado."),
            escena(2, "Desarrollo", "Un tablero por pieza. Una escena por línea."),
            escena(3, "Prueba", "Cinco piezas en una tarde, sin perder ninguna toma."),
            escena(4, "Cierre", "Crea tu primer proyecto en treinta segundos.")
          ]
        }
      },
      {
        _id: id("v"),
        label: "Corte final",
        createdAt: HOY,
        snapshot: {
          label: "Corte final",
          title: proyecto.title,
          brief: proyecto.brief,
          format: proyecto.format,
          musicTitle: "Pulso lento",
          musicUrl: proyecto.musicUrl,
          scenes: [
            escena(0, "Gancho", "Grabaste el mismo reel tres veces. No era el guion."),
            escena(1, "Contexto", "Por qué importa: el guion, las tomas y la música viven en tres sitios."),
            escena(2, "Desarrollo", "Un tablero por pieza. Una escena por línea."),
            escena(3, "Prueba", "Cinco piezas en una tarde, sin perder ninguna toma."),
            escena(4, "Cierre", "Crea tu primer proyecto en treinta segundos.")
          ]
        }
      }
    ];
    proyecto.updatedAt = HOY;
    return proyecto;
  })(),
  (() => {
    const proyecto = conPlantilla("cuadrado", "Anuncio cuadrado");
    proyecto.updatedAt = AYER;
    return proyecto;
  })(),
  (() => {
    const proyecto = conPlantilla("portada", "Portada del episodio 12");
    proyecto.updatedAt = AYER - 86400000;
    return proyecto;
  })()
];

// --- API falsa ----------------------------------------------------------
const latencia = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));
const presentar = (proyecto, completo = false) => ({
  ...proyecto,
  versionsCount: proyecto.versions.length,
  versions: proyecto.versions.map((version) =>
    completo
      ? { ...version, scenesCount: version.snapshot.scenes.length }
      : { _id: version._id, label: version.label, createdAt: version.createdAt, scenesCount: version.snapshot.scenes.length }
  )
});

async function atender(config) {
  const metodo = String(config.method || "get").toLowerCase();
  const ruta = String(config.url || "").replace(/^\/?api/, "");
  const cuerpo = config.data ? JSON.parse(config.data) : {};
  await latencia();

  if (ruta === "/projects" && metodo === "get") {
    return { projects: proyectos.map((proyecto) => presentar(proyecto)).sort((a, b) => b.updatedAt - a.updatedAt) };
  }
  if (ruta === "/projects" && metodo === "post") {
    const proyecto = {
      _id: id("p"),
      owner: "demo",
      title: String(cuerpo.title || "Sin título").slice(0, 120),
      brief: String(cuerpo.brief || "").slice(0, 2000),
      format: cuerpo.format || "libre",
      scenes: (cuerpo.scenes || []).slice(0, 60).map((item, index) => escena(index, item.title || "", item.script || "", item.mediaUrl || "")),
      musicTitle: "",
      musicUrl: "",
      versions: [],
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    proyectos.unshift(proyecto);
    return { project: presentar(proyecto) };
  }

  const detalle = ruta.match(/^\/projects\/([^/]+)$/);
  const versiones = ruta.match(/^\/projects\/([^/]+)\/versions$/);
  const version = ruta.match(/^\/projects\/([^/]+)\/versions\/([^/]+)$/);
  const proyecto = detalle && proyectos.find((item) => item._id === detalle[1]);

  if (detalle && metodo === "get") {
    if (!proyecto) throw { response: { status: 404, data: { error: "Proyecto no encontrado" } } };
    return { project: presentar(proyecto, true) };
  }
  if (detalle && metodo === "patch") {
    if (!proyecto) throw { response: { status: 404, data: { error: "Proyecto no encontrado" } } };
    Object.assign(proyecto, {
      title: String(cuerpo.title ?? proyecto.title).slice(0, 120),
      brief: String(cuerpo.brief ?? proyecto.brief).slice(0, 2000),
      format: cuerpo.format ?? proyecto.format,
      musicTitle: cuerpo.musicTitle ?? proyecto.musicTitle,
      musicUrl: cuerpo.musicUrl ?? proyecto.musicUrl,
      scenes: Array.isArray(cuerpo.scenes)
        ? cuerpo.scenes.slice(0, 60).map((item, index) => escena(index, item.title || "", item.script || "", item.mediaUrl || ""))
        : proyecto.scenes,
      updatedAt: Date.now()
    });
    return { project: presentar(proyecto, true) };
  }
  if (detalle && metodo === "delete") {
    const indice = proyectos.findIndex((item) => item._id === detalle[1]);
    if (indice < 0) throw { response: { status: 404, data: { error: "Proyecto no encontrado" } } };
    proyectos.splice(indice, 1);
    return { deleted: true };
  }
  if (versiones && metodo === "post") {
    const objetivo = proyectos.find((item) => item._id === versiones[1]);
    if (!objetivo) throw { response: { status: 404, data: { error: "Proyecto no encontrado" } } };
    if (objetivo.versions.length >= 30) throw { response: { status: 400, data: { error: "Un proyecto guarda hasta 30 versiones" } } };
    const etiqueta = String(cuerpo.label || "").slice(0, 80);
    const nueva = {
      _id: id("v"),
      label: etiqueta,
      createdAt: Date.now(),
      snapshot: {
        label: etiqueta,
        title: objetivo.title,
        brief: objetivo.brief,
        format: objetivo.format,
        musicTitle: objetivo.musicTitle,
        musicUrl: objetivo.musicUrl,
        scenes: objetivo.scenes.map((item) => ({ ...item, _id: id("s") }))
      }
    };
    objetivo.versions.unshift(nueva);
    objetivo.updatedAt = Date.now();
    return { version: { _id: nueva._id, label: nueva.label, createdAt: nueva.createdAt, scenesCount: nueva.snapshot.scenes.length } };
  }
  if (version && metodo === "delete") {
    const objetivo = proyectos.find((item) => item._id === version[1]);
    if (!objetivo) throw { response: { status: 404, data: { error: "Proyecto no encontrado" } } };
    objetivo.versions = objetivo.versions.filter((item) => item._id !== version[2]);
    return { deleted: true };
  }

  throw { response: { status: 404, data: { error: `Demo: ruta no simulada ${metodo.toUpperCase()} ${ruta}` } } };
}

api.defaults.adapter = async (config) => ({
  data: await atender(config),
  status: 200,
  statusText: "OK",
  headers: {},
  config
});

// --- pantalla -----------------------------------------------------------
function Demo() {
  return (
    <HashRouter>
      <div className="demo-shell">
        <header className="demo-bar">
          <strong>Demo local · Proyectos</strong>
          <nav>
            <NavLink to="/projects" end>Proyectos</NavLink>
            <NavLink to="/projects/plantillas">Plantillas</NavLink>
            <Link to="/projects">Volver</Link>
          </nav>
          <span className="demo-note">Datos de ejemplo en memoria · nada se guarda al recargar</span>
        </header>
        <main className="demo-main">
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/plantillas" element={<TemplatesPage />} />
            <Route path="/projects/:projectId" element={<ProjectBoard />} />
            <Route path="*" element={<ProjectsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <Demo />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
