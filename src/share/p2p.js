/**
 * p2p.js — a real WebRTC connection between two browsers, set up through a
 * short room code instead of a copy-pasted SDP blob.
 *
 * `api/src/routes/signal.js` is a blind relay: it only ever forwards the
 * handshake (offer/answer/ICE candidates) between the two sockets in a
 * room, never document content. Once the data channel opens, everything
 * sent over it goes directly between the two browsers.
 *
 *   const session = createHostSession(roomId, { onConnected, onMessage, onStatus });
 *   const session = joinSession(roomId, { onConnected, onMessage, onStatus });
 *   session.close();
 */
const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CHANNEL_LABEL = 'documend-sync';

// Same VITE_API_URL, same fallback and trailing-slash handling as
// src/api/client.js's BASE_URL — just http(s) turned into ws(s).
function signalingUrl(roomId) {
  const base = (import.meta.env?.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  return `${base.replace(/^http/, 'ws')}/signal/${roomId}`;
}

function connect(roomId, isHost, { onConnected, onMessage, onStatus, onError } = {}) {
  const status = (value) => onStatus?.(value);
  const ws = new WebSocket(signalingUrl(roomId));
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  let channel = null;

  const send = (message) => channel?.readyState === 'open' && channel.send(JSON.stringify(message));

  const setupChannel = (ch) => {
    channel = ch;
    channel.onopen = () => { status('connected'); onConnected?.(send); };
    channel.onmessage = (event) => { try { onMessage?.(JSON.parse(event.data)); } catch { /* ignore a malformed message */ } };
    channel.onclose = () => status('disconnected');
  };

  if (isHost) setupChannel(pc.createDataChannel(CHANNEL_LABEL));
  else pc.ondatachannel = (event) => setupChannel(event.channel);

  pc.onicecandidate = (event) => {
    if (event.candidate) ws.send(JSON.stringify({ type: 'ice-candidate', data: event.candidate }));
  };

  ws.onopen = () => { status('connecting'); };

  const sendOffer = async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', data: pc.localDescription }));
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    try {
      if (message.type === 'peer-joined') {
        // The guest is confirmed present now — safe to send the offer,
        // instead of on our own socket opening, when nobody may be there yet
        // to receive it (see api/src/routes/signal.js).
        if (isHost) await sendOffer();
      } else if (message.type === 'offer') {
        await pc.setRemoteDescription(message.data);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', data: pc.localDescription }));
      } else if (message.type === 'answer') {
        await pc.setRemoteDescription(message.data);
      } else if (message.type === 'ice-candidate') {
        await pc.addIceCandidate(message.data);
      }
    } catch (error) {
      onError?.(error);
    }
  };

  ws.onclose = (event) => {
    // 4000 room_full, 4001 peer_left — see api/src/routes/signal.js
    if (event.code === 4000) onError?.(new Error('That code is already in use by two other people.'));
    else if (event.code === 4001) status('disconnected');
  };
  ws.onerror = () => onError?.(new Error('Could not reach the sync server.'));

  return {
    close: () => {
      channel?.close();
      pc.close();
      ws.close();
    },
  };
}

/** Creates a room and waits for someone to join it. */
export function createHostSession(roomId, handlers) {
  return connect(roomId, true, handlers);
}

/** Joins a room someone else already created. */
export function joinSession(roomId, handlers) {
  return connect(roomId, false, handlers);
}

const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L — read aloud or typed by hand

/** A short, human-friendly room code — easy to read out, type or say over a call. */
export function generateRoomCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  return code;
}
