/**
 * signal.js — the P2P sync bridge's signaling relay.
 *
 *   WS /signal/:room
 *
 * Two browsers can't find each other directly, so before a real WebRTC
 * connection exists they need to trade a handful of connection-setup
 * messages (an SDP offer, an SDP answer, ICE candidates). This route does
 * exactly that and nothing else: whichever two sockets connect to the same
 * room id get every message the other one sends, verbatim, and the server
 * never reads what's inside a message.
 *
 * No account, no database, no document ever touches this route — rooms
 * live only in memory, for as long as it takes two people to connect, and
 * are gone the moment both leave (or a few minutes after only one ever
 * showed up).
 */
const ROOM_TIMEOUT_MS = 5 * 60 * 1000;

/** roomId -> { host, guest, timer } */
const rooms = new Map();

function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.timer);
  rooms.delete(roomId);
}

export default async function signalRoutes(app) {
  app.get('/signal/:room', { websocket: true }, (socket, request) => {
    const { room: roomId } = request.params;
    let room = rooms.get(roomId);

    if (!room) {
      room = {
        host: socket,
        guest: null,
        // An abandoned room (nobody ever joined) shouldn't sit in memory forever.
        timer: setTimeout(() => closeRoom(roomId), ROOM_TIMEOUT_MS),
      };
      rooms.set(roomId, room);
    } else if (!room.guest) {
      room.guest = socket;
      clearTimeout(room.timer);
      // The host may have been sitting here for a while before anyone joined;
      // telling it now (rather than the host guessing when to send its offer)
      // is what stops that offer from being sent — and silently dropped,
      // since nobody was here yet to relay it to — before this moment.
      if (room.host.readyState === room.host.OPEN) room.host.send(JSON.stringify({ type: 'peer-joined' }));
    } else {
      // Someone else is already using this room.
      socket.close(4000, 'room_full');
      return;
    }

    const other = () => {
      const current = rooms.get(roomId);
      if (!current) return null;
      return current.host === socket ? current.guest : current.host;
    };

    socket.on('message', (raw) => {
      const peer = other();
      if (peer && peer.readyState === peer.OPEN) peer.send(raw.toString());
    });

    socket.on('close', () => {
      const peer = other();
      if (peer && peer.readyState === peer.OPEN) peer.close(4001, 'peer_left');
      closeRoom(roomId);
    });
  });
}
