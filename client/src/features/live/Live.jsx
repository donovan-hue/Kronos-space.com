import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getUser, getToken } from "../../services/authStorage";
import {
  createLiveRoom,
  endLiveRoom,
  getLiveIceServers,
  getLiveRoomById,
  getLiveRooms,
  getMyLiveRooms,
  inviteToLiveRoom,
  joinLiveRoom,
  leaveLiveRoom
} from "../../services/liveService";
import { connectSocket, getSocket } from "../../services/socket";
import EmptyState from "../../components/ui/EmptyState";
import Spinner from "../../components/ui/Spinner";
import { captureLiveMedia, enableLiveTracks } from "./liveMedia";

// Último recurso si `GET /live/ice` falla: el STUN que ya usaba el cliente.
// El TURN, cuando el despliegue lo tiene, llega del servidor.
const FALLBACK_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const MAX_ROOM_PARTICIPANTS = 500;

function roomsOf(payload) {
  return Array.isArray(payload?.rooms) ? payload.rooms : [];
}

function hostIdOf(room) {
  return String(room?.host?._id || room?.host || "");
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

function MediaView({ stream, muted = false, video = false, label }) {
  const ref = useRef(null);
  const attachRef = useCallback(
    (node) => {
      ref.current = node;
      if (node) node.srcObject = stream || null;
    },
    [stream]
  );

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);

  if (video) {
    return <video ref={attachRef} autoPlay playsInline muted={muted} aria-label={label} />;
  }

  return <audio ref={attachRef} autoPlay muted={muted} aria-label={label} />;
}

export default function Live() {
  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);
  // `/live?room=<id>`: enlace directo a una sala. Antes la ruta ignoraba la
  // consulta, así que un enlace compartido abría la lista y no la sala.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRoomId = searchParams.get("room") || "";
  const [publicRooms, setPublicRooms] = useState([]);
  const [mine, setMine] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [roomType, setRoomType] = useState("audio");
  const [isPublic, setIsPublic] = useState(true);
  const [maxParticipants, setMaxParticipants] = useState(100);
  const [ice, setIce] = useState({ servers: FALLBACK_ICE_SERVERS, hasTurn: false });
  const [inviteName, setInviteName] = useState("");
  const [active, setActive] = useState(null);
  const [viewers, setViewers] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [remotes, setRemotes] = useState([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [pendingExit, setPendingExit] = useState(null);
  const [requestedRoom, setRequestedRoom] = useState(null);
  const [requestedError, setRequestedError] = useState("");
  const mountedRef = useRef(true);

  const activeRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const iceRef = useRef({ servers: FALLBACK_ICE_SERVERS, hasTurn: false });
  const meIdRef = useRef(meId);

  useEffect(() => {
    meIdRef.current = meId;
  }, [meId]);

  // Los servidores ICE se piden al abrir la pantalla y antes de cada entrada.
  // Si el endpoint falla se sigue con STUN: mejor una sala a medias que
  // ninguna, y la interfaz ya avisa de que sin TURN puede no conectarse.
  const loadIce = useCallback(async () => {
    try {
      const data = await getLiveIceServers();
      if (Array.isArray(data.servers) && data.servers.length) {
        iceRef.current = data;
        setIce(data);
        return;
      }
      throw new Error("Sin servidores ICE");
    } catch {
      iceRef.current = { servers: FALLBACK_ICE_SERVERS, hasTurn: false };
      setIce(iceRef.current);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [open, own] = await Promise.all([getLiveRooms(), getMyLiveRooms()]);
      setPublicRooms(roomsOf(open));
      setMine(roomsOf(own));
      setRoomsLoaded(true);
      setError("");
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudieron cargar las salas en vivo."));
    } finally {
      setLoading(false);
    }
  }, []);

  const closePeers = useCallback(() => {
    for (const peer of peersRef.current.values()) peer.pc.close();
    peersRef.current.clear();
    setRemotes([]);
  }, []);

  const stopLocal = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const leaveSocket = useCallback((roomId) => {
    const socket = getSocket();
    if (socket && roomId) socket.emit("live:leave", { roomId: String(roomId) });
  }, []);

  const ensurePeer = useCallback((peerId) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing.pc;

    const pc = new RTCPeerConnection({ iceServers: iceRef.current.servers });
    const record = { pc, pending: [] };
    const stream = localStreamRef.current;

    if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      const roomId = activeRef.current?._id;
      const socket = getSocket();
      if (!event.candidate || !roomId || !socket) return;
      socket.emit("live:signal", {
        roomId: String(roomId),
        targetPeerId: peerId,
        signal: { type: "candidate", candidate: event.candidate.toJSON() }
      });
    };

    pc.ontrack = (event) => {
      const remote = event.streams[0];
      if (!remote) return;
      setRemotes((current) => {
        const next = current.filter((item) => item.peerId !== peerId);
        return [...next, { peerId, stream: remote }];
      });
    };

    peersRef.current.set(peerId, record);
    return pc;
  }, []);

  const offerTo = useCallback(async (peerId) => {
    const roomId = activeRef.current?._id;
    const socket = getSocket();
    if (!roomId || !socket || !peerId || peerId === meIdRef.current) return;

    const pc = ensurePeer(peerId);
    if (pc.signalingState !== "stable") return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("live:signal", {
      roomId: String(roomId),
      targetPeerId: peerId,
      signal: { type: "offer", sdp: pc.localDescription.toJSON() }
    });
  }, [ensurePeer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const token = getToken();
    const socket = token ? connectSocket(token) : getSocket();
    if (!socket) return undefined;

    function onPeerJoined(payload) {
      const peerId = String(payload?.peerId || "");
      if (!activeRef.current || !peerId || peerId === meIdRef.current) return;
      const previous = peersRef.current.get(peerId);
      previous?.pc.close();
      peersRef.current.delete(peerId);
      offerTo(peerId).catch(() => setError("No se pudo abrir la conexión con quien acaba de entrar."));
    }

    function onPeerLeft(payload) {
      const peerId = String(payload?.peerId || "");
      const record = peersRef.current.get(peerId);
      record?.pc.close();
      peersRef.current.delete(peerId);
      setRemotes((current) => current.filter((item) => item.peerId !== peerId));
    }

    async function onSignal(payload) {
      const roomId = String(payload?.roomId || "");
      const fromPeerId = String(payload?.fromPeerId || "");
      const signal = payload?.signal;
      if (!activeRef.current || roomId !== String(activeRef.current._id) || !fromPeerId || !signal) return;

      const pc = ensurePeer(fromPeerId);
      const record = peersRef.current.get(fromPeerId);
      const polite = meIdRef.current > fromPeerId;

      try {
        if (signal.type === "offer") {
          if (pc.signalingState !== "stable") {
            if (!polite) return;
            await pc.setLocalDescription({ type: "rollback" });
          }
          await pc.setRemoteDescription(signal.sdp);
          for (const candidate of record.pending.splice(0)) {
            await pc.addIceCandidate(candidate);
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("live:signal", {
            roomId,
            targetPeerId: fromPeerId,
            signal: { type: "answer", sdp: pc.localDescription.toJSON() }
          });
        } else if (signal.type === "answer") {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(signal.sdp);
            for (const candidate of record.pending.splice(0)) {
              await pc.addIceCandidate(candidate);
            }
          }
        } else if (signal.type === "candidate" && signal.candidate) {
          if (!pc.remoteDescription) record.pending.push(signal.candidate);
          else await pc.addIceCandidate(signal.candidate);
        }
      } catch {
        setError("La señal de audio o video no se pudo aplicar. Puedes salir y volver a entrar.");
      }
    }

    function onEnded(payload) {
      if (!activeRef.current || String(payload?.roomId) !== String(activeRef.current._id)) return;
      activeRef.current = null;
      closePeers();
      stopLocal();
      setActive(null);
      setNotice("La transmisión terminó.");
      refresh();
    }

    function onCount(payload) {
      if (activeRef.current && String(payload?.roomId) === String(activeRef.current._id)) {
        setViewers(Number(payload.viewersCount) || 0);
      }
    }

    // Una sala nueva no aparecía hasta recargar: el servidor ya emitía
    // `live:room-started` y nadie lo escuchaba. Se añade a la lista sin
    // volver a pedir todo (y sin duplicar la propia).
    function onStarted(room) {
      if (!room?._id || room.isPublic === false) return;
      if (hostIdOf(room) === meIdRef.current) return;
      setPublicRooms((current) => {
        if (current.some((item) => String(item._id) === String(room._id))) return current;
        return [room, ...current];
      });
      setRoomsLoaded(true);
    }

    function onInvited(payload) {
      if (!payload?.roomId) return;
      setInvites((current) => {
        if (current.some((item) => String(item.roomId) === String(payload.roomId))) return current;
        return [...current, payload];
      });
      setNotice(payload.title ? `Te invitaron a «${payload.title}».` : "Tienes una invitación a una sala privada.");
    }

    function onError(payload) {
      const code = payload?.code;
      if (!code || !activeRef.current || String(payload.roomId) !== String(activeRef.current._id)) return;
      if (code === "LIVE_FORBIDDEN") setError("Esta sala es privada. Solo entra quien fue invitado.");
      else if (code === "LIVE_ENDED") setError("La sala ya terminó.");
      else if (code === "LIVE_NOT_IN_ROOM") setError("Todavía no estás dentro de la sala.");
    }

    socket.on("live:peer-joined", onPeerJoined);
    socket.on("live:peer-left", onPeerLeft);
    socket.on("live:signal", onSignal);
    socket.on("live:room-ended", onEnded);
    socket.on("live:viewer-count", onCount);
    socket.on("live:invited", onInvited);
    socket.on("live:room-started", onStarted);
    socket.on("live:error", onError);

    return () => {
      socket.off("live:peer-joined", onPeerJoined);
      socket.off("live:peer-left", onPeerLeft);
      socket.off("live:signal", onSignal);
      socket.off("live:room-ended", onEnded);
      socket.off("live:viewer-count", onCount);
      socket.off("live:invited", onInvited);
      socket.off("live:room-started", onStarted);
      socket.off("live:error", onError);
    };
  }, [closePeers, ensurePeer, offerTo, refresh, stopLocal]);

  useEffect(() => {
    loadIce();
  }, [loadIce]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const room = activeRef.current;
      activeRef.current = null;
      closePeers();
      // También cerrar capturas mientras la API aún está creando la sala.
      stopLocal();
      if (room?._id) {
        leaveSocket(room._id);
        if (hostIdOf(room) !== meIdRef.current) leaveLiveRoom(room._id).catch(() => {});
      }
    };
  }, [closePeers, leaveSocket, stopLocal]);

  async function openMedia(type, prepared = null) {
    const stream = prepared || await captureLiveMedia(type);
    if (!mountedRef.current || (type === "screen" && !stream.getVideoTracks().some(track => track.readyState !== "ended"))) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("La captura se detuvo antes de entrar. Vuelve a intentarlo.");
    }
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicEnabled(true);
    setCameraEnabled(true);
    if (type === "screen") {
      // El botón nativo «Dejar de compartir» también detiene el micrófono.
      // Nunca queda una transmisión de audio inadvertida después de cerrar la pantalla.
      stream.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (activeRef.current) void exitRoom(true);
          else stopLocal();
        };
      });
    }
    return stream;
  }

  async function enter(room, prepared = null) {
    if (!room?._id || busy || pendingExit) return;
    setBusy("enter");
    setError("");
    setNotice("");

    if (activeRef.current && String(activeRef.current._id) !== String(room._id)) {
      leaveSocket(activeRef.current._id);
      closePeers();
      stopLocal();
      if (hostIdOf(activeRef.current) !== meId) {
        void leaveLiveRoom(activeRef.current._id).catch(() => {});
      }
      activeRef.current = null;
      setActive(null);
    }

    try {
      // Credenciales ICE frescas por entrada: un TURN que caduca a mitad de
      // sesión se notaría como «no conecta» sin explicación.
      await loadIce();
      const mediaType = room.type === "screen"
        ? (hostIdOf(room) === meId ? "screen" : "audio")
        : room.type === "video" ? "video" : "audio";
      // Para el anfitrión el selector de pantalla se abre con el clic actual,
      // antes de esperar respuestas HTTP. Los invitados NO comparten pantalla.
      if (mediaType === "screen" && !prepared) prepared = await openMedia("screen");
      if (!mountedRef.current) throw new Error("Entrada cancelada.");
      await joinLiveRoom(room._id);
      if (!mountedRef.current) throw new Error("Entrada cancelada.");
      activeRef.current = room;
      await openMedia(mediaType, prepared);
      const socket = connectSocket(getToken());
      if (!socket) throw new Error("No hay conexión en tiempo real.");

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.off("live:joined", onJoined);
          socket.off("live:error", onFail);
          reject(new Error("La sala no confirmó la entrada."));
        }, 8000);

        function onJoined(payload) {
          if (String(payload?.roomId) !== String(room._id)) return;
          clearTimeout(timer);
          socket.off("live:joined", onJoined);
          socket.off("live:error", onFail);
          resolve();
        }

        function onFail(payload) {
          if (String(payload?.roomId) !== String(room._id)) return;
          clearTimeout(timer);
          socket.off("live:joined", onJoined);
          socket.off("live:error", onFail);
          reject(new Error(payload?.code === "LIVE_FORBIDDEN"
            ? "Esta sala es privada. Solo entra quien fue invitado."
            : "No se pudo abrir la sala en tiempo real."));
        }

        socket.on("live:joined", onJoined);
        socket.on("live:error", onFail);
        socket.emit("live:join", { roomId: String(room._id) });
      });

      setActive(room);
      setViewers(room.viewersCount || room.participantsCount || 1);
      setInvites((current) => current.filter((item) => String(item.roomId) !== String(room._id)));
    } catch (requestError) {
      activeRef.current = null;
      setActive(null);
      closePeers();
      stopLocal();
      leaveSocket(room._id);
      if (hostIdOf(room) !== meId) await leaveLiveRoom(room._id).catch(() => {});
      setError(errorMessage(requestError, "No se pudo entrar a la sala."));
    } finally {
      setBusy("");
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || busy || pendingExit) return;
    setBusy("create");
    setError("");
    try {
      const prepared = await openMedia(roomType);
      if (!mountedRef.current) throw new Error("Creación cancelada.");
      const data = await createLiveRoom({
        title: clean,
        type: roomType,
        isPublic,
        maxParticipants
      });
      const room = data?.room;
      if (!room?._id) throw new Error("El servidor no confirmó la creación de la sala.");
      if (!mountedRef.current) {
        await endLiveRoom(room._id).catch(() => {});
        return;
      }
      setTitle("");
      if (room) {
        setMine((current) => [room, ...current.filter((item) => String(item._id) !== String(room._id))]);
        if (room.isPublic !== false) {
          setPublicRooms((current) => [room, ...current.filter((item) => String(item._id) !== String(room._id))]);
        }
        await enter(room, prepared);
      }
    } catch (requestError) {
      stopLocal();
      setError(errorMessage(requestError, "No se pudo crear la sala."));
    } finally {
      setBusy("");
    }
  }

  /**
   * Abre la sala pedida por `?room=<id>` (enlace compartido, notificación).
   * No entra sola: pide permiso con un botón para que abrir un enlace no
   * encienda la cámara sin que el usuario lo haya decidido.
   */
  useEffect(() => {
    if (!requestedRoomId || active) {
      setRequestedRoom(null);
      setRequestedError("");
      return undefined;
    }
    let cancelled = false;
    setRequestedError("");
    getLiveRoomById(requestedRoomId)
      .then((data) => {
        if (!cancelled) setRequestedRoom(data?.room || null);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setRequestedRoom(null);
          setRequestedError(errorMessage(requestError, "No se pudo abrir esa sala."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestedRoomId, active]);

  function clearRequestedRoom() {
    setRequestedRoom(null);
    setRequestedError("");
    if (searchParams.has("room")) {
      const next = new URLSearchParams(searchParams);
      next.delete("room");
      setSearchParams(next, { replace: true });
    }
  }

  async function exitRoom(end) {
    const room = activeRef.current || pendingExit?.room;
    if (!room || busy === "exit") return;
    const shouldEnd = pendingExit?.end ?? (end || hostIdOf(room) === meId);
    setBusy("exit");
    setError("");
    activeRef.current = null;
    leaveSocket(room._id);
    closePeers();
    stopLocal();
    setActive(null);
    setViewers(0);
    try {
      if (shouldEnd) await endLiveRoom(room._id);
      else await leaveLiveRoom(room._id);
      setPendingExit(null);
      setNotice(shouldEnd ? "Transmisión finalizada." : "Saliste de la sala.");
      await refresh();
    } catch (requestError) {
      setPendingExit({ room, end: shouldEnd });
      setError(`Tu audio y video ya están detenidos. ${errorMessage(requestError, "El servidor no confirmó el cierre; puedes reintentar.")}`);
    } finally {
      setBusy("");
    }
  }

  function toggleTrack(kind) {
    const next = kind === "audio" ? !micEnabled : !cameraEnabled;
    enableLiveTracks(localStreamRef.current, kind, next);
    if (kind === "audio") setMicEnabled(next);
    else setCameraEnabled(next);
  }

  async function handleInvite(event) {
    event.preventDefault();
    const username = inviteName.trim().replace(/^@/, "");
    if (!active || !username) return;
    setBusy("invite");
    setError("");
    try {
      const result = await inviteToLiveRoom(active._id, { username });
      setInviteName("");
      setNotice(result?.already
        ? `@${result.user?.username || username} ya estaba en la sala.`
        : `Invitación enviada a @${result.user?.username || username}.`);
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudo invitar."));
    } finally {
      setBusy("");
    }
  }

  const hosting = Boolean(active && hostIdOf(active) === meId);
  const visibleMine = mine.filter((room) => !publicRooms.some((open) => String(open._id) === String(room._id)));
  const videoRoom = active?.type === "video" || active?.type === "screen";
  const screenSupported = Boolean(globalThis.navigator?.mediaDevices?.getDisplayMedia);

  return (
    <section className="page k-live" aria-labelledby="k-live-title">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">EN VIVO</p>
          <h1 id="k-live-title">Salas de audio, video y pantalla</h1>
          <p className="k-muted">
            El audio sale de tu navegador directo a quien está en la sala.
            {ice.hasTurn
              ? " Este despliegue tiene un servidor de retransmisión (TURN), así que también funciona con NAT estricto."
              : " Este despliegue no tiene servidor de retransmisión (TURN): si las dos redes usan NAT simétrico, la llamada puede no conectarse."}
          </p>
        </div>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {notice && <p className="k-state k-state-success" role="status">{notice}</p>}
      {pendingExit && <button type="button" className="k-button k-button-secondary" disabled={busy === "exit"} onClick={() => exitRoom(pendingExit.end)}>Reintentar cierre de la sala</button>}

      {active ? (
        <section className="k-surface k-live-stage" aria-label="Sala actual">
          <header className="k-live-stage-head">
            <div>
              <p className="k-eyebrow">{active.isPublic === false ? "PRIVADA" : "PÚBLICA"} · {active.type === "screen" ? "PANTALLA" : videoRoom ? "VIDEO" : "AUDIO"}</p>
              <h2>{active.title}</h2>
              <p className="k-muted">{viewers} en la sala{hosting ? " · eres el anfitrión" : ""}</p>
            </div>
            <div className="k-live-stage-actions">
              <button type="button" className="k-button k-button-secondary" aria-pressed={!micEnabled} onClick={() => toggleTrack("audio")} disabled={busy === "exit"}>
                {micEnabled ? "Silenciar micrófono" : "Activar micrófono"}
              </button>
              {active.type === "video" && <button type="button" className="k-button k-button-secondary" aria-pressed={!cameraEnabled} onClick={() => toggleTrack("video")} disabled={busy === "exit"}>
                {cameraEnabled ? "Apagar cámara" : "Activar cámara"}
              </button>}
              {hosting ? (
                <button type="button" className="k-button k-button-primary" onClick={() => exitRoom(true)} disabled={busy === "exit"}>
                  Finalizar
                </button>
              ) : (
                <button type="button" className="k-button k-button-ghost" onClick={() => exitRoom(false)} disabled={busy === "exit"}>
                  Salir
                </button>
              )}
            </div>
          </header>

          <div className="k-live-media">
            <div className="k-live-tile">
              <MediaView stream={localStream} muted video={videoRoom} label={active.type === "screen" && hosting ? "Tu pantalla compartida" : "Tu audio y video"} />
              {!videoRoom && <span className="k-live-mic" aria-hidden="true" />}
              <small>Tú</small>
            </div>
            {remotes.map((remote) => (
              <div className="k-live-tile" key={remote.peerId}>
                <MediaView stream={remote.stream} video={videoRoom} label="Participante" />
                {!videoRoom && <span className="k-live-mic" aria-hidden="true" />}
                <small>Participante</small>
              </div>
            ))}
          </div>

          {hosting && (
            <form className="k-live-invite" onSubmit={handleInvite}>
              <label>
                Invitar por usuario
                <input
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  placeholder="nombre de usuario"
                  maxLength={30}
                  autoComplete="off"
                />
              </label>
              <button type="button" className="k-button k-button-primary" disabled={busy === "invite" || !inviteName.trim()} onClick={handleInvite}>
                {busy === "invite" ? "Invitando..." : "Invitar"}
              </button>
            </form>
          )}
        </section>
      ) : (
        <>
        {(requestedRoom || requestedError) && (
          <section className="k-surface k-live-requested" aria-label="Sala solicitada">
            {requestedError ? (
              <>
                <p role="alert" className="k-state k-state-error">{requestedError}</p>
                <button type="button" className="k-button k-button-ghost" onClick={clearRequestedRoom}>Descartar</button>
              </>
            ) : (
              <>
                <div>
                  <p className="k-eyebrow">TE INVITARON A UNA SALA</p>
                  <strong>{requestedRoom.title}</strong>
                  <p className="k-muted">
                    {requestedRoom.host?.displayName || requestedRoom.host?.username || "Anfitrión"} ·{" "}
                    {requestedRoom.type === "screen" ? "pantalla" : requestedRoom.type === "video" ? "video" : "audio"}
                  </p>
                </div>
                <div className="k-live-stage-actions">
                  <button
                    type="button"
                    className="k-button k-button-primary"
                    disabled={Boolean(busy) || Boolean(pendingExit)}
                    onClick={async () => {
                      const room = requestedRoom;
                      clearRequestedRoom();
                      await enter(room);
                    }}
                  >
                    Entrar
                  </button>
                  <button type="button" className="k-button k-button-ghost" onClick={clearRequestedRoom}>
                    Ahora no
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        <form className="k-surface k-live-create" onSubmit={handleCreate}>
          <h2>Abrir una sala</h2>
          <label>
            Título
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Conversación de esta noche" />
          </label>
          <label>
            Tipo
            <select value={roomType} onChange={(event) => setRoomType(event.target.value)}>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
              <option value="screen" disabled={!screenSupported}>Compartir pantalla y micrófono</option>
            </select>
          </label>
          {!screenSupported && <p className="k-muted">Este navegador no admite compartir pantalla; audio y video siguen disponibles.</p>}
          <label className="k-live-check">
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            Sala pública. Si la desmarcas, solo entra quien invites.
          </label>
          <label>
            Máximo de participantes
            <input
              type="number"
              min={2}
              max={MAX_ROOM_PARTICIPANTS}
              value={maxParticipants}
              onChange={(event) => {
                const next = Number(event.target.value);
                setMaxParticipants(
                  Number.isFinite(next) ? Math.min(Math.max(Math.trunc(next), 1), MAX_ROOM_PARTICIPANTS) : 100
                );
              }}
            />
          </label>
          <button type="submit" className="k-button k-button-primary" disabled={Boolean(busy) || Boolean(pendingExit) || !title.trim()}>
            {busy === "create" ? "Abriendo..." : "Empezar"}
          </button>
        </form>
        </>
      )}

      {invites.length > 0 && (
        <section className="k-surface k-live-list" aria-label="Invitaciones">
          <h2>Invitaciones</h2>
          {invites.map((invite) => (
            <article key={invite.roomId}>
              <strong>{invite.title || "Sala privada"}</strong>
              <button
                type="button"
                className="k-button k-button-primary"
                disabled={Boolean(busy) || Boolean(pendingExit)}
                onClick={async () => {
                  setBusy("enter");
                  try {
                    const data = await getLiveRoomById(invite.roomId);
                    await enter(data?.room || { _id: invite.roomId, title: invite.title || "Sala privada", type: "audio", isPublic: false });
                  } catch (requestError) {
                    setError(errorMessage(requestError, "No se pudo abrir la invitación."));
                    // Sin este `finally` el botón quedaba deshabilitado para
                    // siempre tras un fallo: `busy` no se limpiaba.
                    setBusy((current) => (current === "enter" ? "" : current));
                  }
                }}
              >
                Entrar
              </button>
            </article>
          ))}
        </section>
      )}

      {loading ? <Spinner label="Cargando salas..." /> : !roomsLoaded ? (
        <button type="button" className="k-button k-button-secondary" onClick={refresh}>Reintentar carga de salas</button>
      ) : (
        <>
          <section className="k-live-list" aria-label="Salas públicas">
            <h2>Ahora en público</h2>
            {publicRooms.length === 0 ? (
              <EmptyState title="No hay salas públicas." description="Cuando alguien abra una, aparecerá aquí." />
            ) : publicRooms.map((room) => (
              <article className="k-surface" key={room._id}>
                <div>
                  <strong>{room.title}</strong>
                  <p className="k-muted">{room.host?.displayName || room.host?.username || "Anfitrión"} · {room.type === "screen" ? "pantalla" : room.type === "video" ? "video" : "audio"} · {room.viewersCount || room.participantsCount || 0}</p>
                </div>
                <button type="button" className="k-button k-button-primary" onClick={() => enter(room)} disabled={Boolean(busy) || Boolean(pendingExit)}>
                  Entrar
                </button>
              </article>
            ))}
          </section>

          {visibleMine.length > 0 && (
            <section className="k-live-list" aria-label="Tus salas">
              <h2>Tus salas</h2>
              {visibleMine.map((room) => (
                <article className="k-surface" key={room._id}>
                  <div>
                    <strong>{room.title}</strong>
                    <p className="k-muted">{room.isPublic === false ? "Privada" : "Pública"} · {hostIdOf(room) === meId ? "anfitrión" : "invitado"}</p>
                  </div>
                  <button type="button" className="k-button k-button-ghost" onClick={() => enter(room)} disabled={Boolean(busy) || Boolean(pendingExit)}>
                    Volver a entrar
                  </button>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
