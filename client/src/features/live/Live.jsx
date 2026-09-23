import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUser, getToken } from "../../services/authStorage";
import {
  createLiveRoom,
  endLiveRoom,
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

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

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

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);

  if (video) {
    return <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} />;
  }

  return <audio ref={ref} autoPlay muted={muted} aria-label={label} />;
}

export default function Live() {
  const meId = useMemo(() => String(getUser()?._id || getUser()?.id || ""), []);
  const [publicRooms, setPublicRooms] = useState([]);
  const [mine, setMine] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [roomType, setRoomType] = useState("audio");
  const [isPublic, setIsPublic] = useState(true);
  const [inviteName, setInviteName] = useState("");
  const [active, setActive] = useState(null);
  const [viewers, setViewers] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [remotes, setRemotes] = useState([]);

  const activeRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const meIdRef = useRef(meId);

  useEffect(() => {
    meIdRef.current = meId;
  }, [meId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [open, own] = await Promise.all([getLiveRooms(), getMyLiveRooms()]);
      setPublicRooms(roomsOf(open));
      setMine(roomsOf(own));
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
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
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

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
    socket.on("live:error", onError);

    return () => {
      socket.off("live:peer-joined", onPeerJoined);
      socket.off("live:peer-left", onPeerLeft);
      socket.off("live:signal", onSignal);
      socket.off("live:room-ended", onEnded);
      socket.off("live:viewer-count", onCount);
      socket.off("live:invited", onInvited);
      socket.off("live:error", onError);
    };
  }, [closePeers, ensurePeer, offerTo, refresh, stopLocal]);

  useEffect(() => () => {
    const room = activeRef.current;
    if (!room?._id) return;
    leaveSocket(room._id);
    closePeers();
    stopLocal();
    if (hostIdOf(room) !== meIdRef.current) {
      leaveLiveRoom(room._id).catch(() => {});
    }
  }, [closePeers, leaveSocket, stopLocal]);

  async function openMedia(type) {
    const video = type === "video";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  async function enter(room) {
    if (!room?._id || busy) return;
    setBusy("enter");
    setError("");
    setNotice("");

    if (activeRef.current && String(activeRef.current._id) !== String(room._id)) {
      leaveSocket(activeRef.current._id);
      closePeers();
      stopLocal();
      if (hostIdOf(activeRef.current) !== meId) {
        await leaveLiveRoom(activeRef.current._id).catch(() => {});
      }
    }

    try {
      await joinLiveRoom(room._id);
      if (room.type === "screen") {
        setNotice("Compartir pantalla todavía no está disponible. Esta sala usa solo el micrófono.");
      }
      activeRef.current = room;
      await openMedia(room.type === "video" ? "video" : "audio");
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
    if (!clean) return;
    setBusy("create");
    setError("");
    try {
      const data = await createLiveRoom({
        title: clean,
        type: roomType === "video" ? "video" : "audio",
        isPublic
      });
      const room = data?.room;
      setTitle("");
      if (room) {
        setMine((current) => [room, ...current.filter((item) => String(item._id) !== String(room._id))]);
        if (room.isPublic !== false) {
          setPublicRooms((current) => [room, ...current.filter((item) => String(item._id) !== String(room._id))]);
        }
        await enter(room);
      }
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudo crear la sala."));
    } finally {
      setBusy("");
    }
  }

  async function exitRoom(end) {
    const room = activeRef.current;
    if (!room) return;
    setBusy("exit");
    setError("");
    try {
      activeRef.current = null;
      leaveSocket(room._id);
      closePeers();
      stopLocal();
      if (end || hostIdOf(room) === meId) await endLiveRoom(room._id);
      else await leaveLiveRoom(room._id);
      setActive(null);
      setNotice(end || hostIdOf(room) === meId ? "Transmisión finalizada." : "Saliste de la sala.");
      await refresh();
    } catch (requestError) {
      setError(errorMessage(requestError, "No se pudo salir de la sala."));
    } finally {
      setBusy("");
    }
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
  const videoRoom = active?.type === "video";

  return (
    <section className="page k-live" aria-labelledby="k-live-title">
      <header className="k-page-header">
        <div>
          <p className="k-eyebrow">EN VIVO</p>
          <h1 id="k-live-title">Salas de audio y video</h1>
          <p className="k-muted">
            El audio sale de tu navegador directo a quien está en la sala. No hay servidor de retransmisión:
            si las dos redes usan NAT simétrico, la llamada puede no conectarse.
          </p>
        </div>
      </header>

      {error && <p className="k-state k-state-error" role="alert">{error}</p>}
      {notice && <p className="k-state k-state-success" role="status">{notice}</p>}

      {active ? (
        <section className="k-surface k-live-stage" aria-label="Sala actual">
          <header className="k-live-stage-head">
            <div>
              <p className="k-eyebrow">{active.isPublic === false ? "PRIVADA" : "PÚBLICA"} · {videoRoom ? "VIDEO" : "AUDIO"}</p>
              <h2>{active.title}</h2>
              <p className="k-muted">{viewers} en la sala{hosting ? " · eres el anfitrión" : ""}</p>
            </div>
            <div className="k-live-stage-actions">
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
              <MediaView stream={localStream} muted video={videoRoom} label="Tu audio y video" />
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
            </select>
          </label>
          <label className="k-live-check">
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            Sala pública. Si la desmarcas, solo entra quien invites.
          </label>
          <button type="submit" className="k-button k-button-primary" disabled={busy === "create" || !title.trim()}>
            {busy === "create" ? "Abriendo..." : "Empezar"}
          </button>
        </form>
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
                disabled={Boolean(busy)}
                onClick={async () => {
                  try {
                    const data = await getLiveRoomById(invite.roomId);
                    await enter(data?.room || { _id: invite.roomId, title: invite.title || "Sala privada", type: "audio", isPublic: false });
                  } catch (requestError) {
                    setError(errorMessage(requestError, "No se pudo abrir la invitación."));
                  }
                }}
              >
                Entrar
              </button>
            </article>
          ))}
        </section>
      )}

      {loading ? <Spinner label="Cargando salas..." /> : (
        <>
          <section className="k-live-list" aria-label="Salas públicas">
            <h2>Ahora en público</h2>
            {publicRooms.length === 0 ? (
              <EmptyState title="No hay salas públicas." description="Cuando alguien abra una, aparecerá aquí." />
            ) : publicRooms.map((room) => (
              <article className="k-surface" key={room._id}>
                <div>
                  <strong>{room.title}</strong>
                  <p className="k-muted">{room.host?.displayName || room.host?.username || "Anfitrión"} · {room.type === "video" ? "video" : "audio"} · {room.viewersCount || room.participantsCount || 0}</p>
                </div>
                <button type="button" className="k-button k-button-primary" onClick={() => enter(room)} disabled={Boolean(busy)}>
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
                  <button type="button" className="k-button k-button-ghost" onClick={() => enter(room)} disabled={Boolean(busy)}>
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
