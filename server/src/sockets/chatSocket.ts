import { Server, Socket } from 'socket.io';

interface UserPresence {
  userId: string;
  username: string;
  status: 'online' | 'away' | 'dnd';
  socketId: string;
}

const onlineUsers = new Map<string, UserPresence>();

export function setupSocketIO(io: Server) {
  io.on('connection', (socket: Socket) => {
    // User presence registration
    socket.on('user-connected', (userData: { userId: string; username: string }) => {
      if (userData?.userId) {
        onlineUsers.set(userData.userId, {
          userId: userData.userId,
          username: userData.username,
          status: 'online',
          socketId: socket.id,
        });

        // Join personal user notification room
        socket.join(`user_${userData.userId}`);

        // Broadcast updated online presence to everyone
        io.emit('presence-update', Array.from(onlineUsers.values()));
      }
    });

    // Channel Rooms
    socket.on('join-channel', (channelId: string) => {
      socket.join(`channel_${channelId}`);
    });

    socket.on('leave-channel', (channelId: string) => {
      socket.leave(`channel_${channelId}`);
    });

    // Typing Indicators
    socket.on('typing', ({ channelId, username }: { channelId: string; username: string }) => {
      socket.to(`channel_${channelId}`).emit('user-typing', { channelId, username });
    });

    socket.on('stop-typing', ({ channelId, username }: { channelId: string; username: string }) => {
      socket.to(`channel_${channelId}`).emit('user-stop-typing', { channelId, username });
    });

    // Real-time Chat message broadcast
    socket.on('send-message', (messageData: any) => {
      if (messageData.channelId) {
        // Broadcast to channel room
        io.to(`channel_${messageData.channelId}`).emit('new-message', messageData);
      } else if (messageData.recipientId) {
        // Broadcast to direct message recipients
        io.to(`user_${messageData.recipientId}`).emit('new-direct-message', messageData);
        io.to(`user_${messageData.senderId}`).emit('new-direct-message', messageData);
      }
    });

    // Reaction updates
    socket.on('reaction-updated', ({ channelId, reactionData }: any) => {
      if (channelId) {
        io.to(`channel_${channelId}`).emit('reaction-changed', reactionData);
      }
    });

    // Voice & Video Room events
    socket.on('join-voice-room', ({ roomId, user }: { roomId: string; user: any }) => {
      socket.join(`voice_${roomId}`);
      socket.to(`voice_${roomId}`).emit('user-joined-voice', { user, socketId: socket.id });
    });

    socket.on('leave-voice-room', ({ roomId, userId }: { roomId: string; userId: string }) => {
      socket.leave(`voice_${roomId}`);
      socket.to(`voice_${roomId}`).emit('user-left-voice', { userId, socketId: socket.id });
    });

    socket.on('voice-state-update', ({ roomId, userId, isMuted, isCameraOn, isScreenSharing }: any) => {
      socket.to(`voice_${roomId}`).emit('user-voice-state-changed', {
        userId,
        isMuted,
        isCameraOn,
        isScreenSharing,
      });
    });

    // WebRTC Peer-to-Peer Signaling
    socket.on('voice-signal-offer', ({ targetSocketId, offer, callerUser }: any) => {
      io.to(targetSocketId).emit('voice-signal-offer', {
        callerSocketId: socket.id,
        offer,
        callerUser
      });
    });

    socket.on('voice-signal-answer', ({ targetSocketId, answer }: any) => {
      io.to(targetSocketId).emit('voice-signal-answer', {
        responderSocketId: socket.id,
        answer
      });
    });

    socket.on('voice-signal-ice', ({ targetSocketId, candidate }: any) => {
      io.to(targetSocketId).emit('voice-signal-ice', {
        candidate,
        fromSocketId: socket.id
      });
    });

    // In-room voice chat messaging
    socket.on('voice-chat-message', ({ roomId, message }: any) => {
      io.to(`voice_${roomId}`).emit('voice-chat-message', message);
    });

    // Voice Room Mode Management (Stage vs Open Discussion vs Q&A)
    socket.on('voice-set-room-mode', ({ roomId, mode }: { roomId: string; mode: 'stage' | 'open' | 'qa' }) => {
      io.to(`voice_${roomId}`).emit('voice-room-mode-changed', { roomId, mode });
    });

    // Granular Participant Permissions
    socket.on('voice-update-permissions', ({ roomId, targetUserId, canSpeak, canShareScreen }: any) => {
      io.to(`voice_${roomId}`).emit('voice-permissions-updated', {
        targetUserId,
        canSpeak,
        canShareScreen
      });
    });

    // Speaker Request in Stage Mode
    socket.on('voice-speaker-request', ({ roomId, user }: any) => {
      socket.to(`voice_${roomId}`).emit('voice-speaker-request', { user });
    });

    socket.on('voice-speaker-decision', ({ roomId, targetUserId, approved }: any) => {
      io.to(`voice_${roomId}`).emit('voice-speaker-decision', { targetUserId, approved });
    });

    // Kick user from voice room
    socket.on('voice-kick-user', ({ roomId, targetUserId }: any) => {
      io.to(`voice_${roomId}`).emit('voice-user-kicked', { targetUserId });
    });

    // Disconnect
    socket.on('disconnect', () => {
      for (const [userId, user] of onlineUsers.entries()) {
        if (user.socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
      io.emit('presence-update', Array.from(onlineUsers.values()));
    });
  });
}
