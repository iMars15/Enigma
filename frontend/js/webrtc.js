/* ============================================
   Enigma — webrtc.js
   WebRTC Audio / Video Calls
   ============================================ */

const WebRTCCall = (() => {

  /* ── ICE servers ────────────────────────── */
  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Add TURN server here for production:
      // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
    ],
  };

  /* ── State ──────────────────────────────── */
  let state = {
    pc:           null,   // RTCPeerConnection
    localStream:  null,
    remoteStream: null,
    chatId:       null,
    isVideo:      false,
    isInitiator:  false,
    isMuted:      false,
    isVideoOff:   false,
    isSharing:    false,
    callActive:   false,
    timerInterval: null,
    seconds:       0,
  };

  /* ── DOM refs ───────────────────────────── */
  const $ = id => document.getElementById(id);

  /* ─────────────────────────────────────── */
  /*  START OUTGOING CALL                    */
  /* ─────────────────────────────────────── */
  async function startCall(chatId, name, avatar, isVideo) {
    if (state.callActive) return;

    state.chatId     = chatId;
    state.isVideo    = isVideo;
    state.isInitiator = true;

    showCallOverlay({ name, avatar, isVideo, status: 'calling' });

    try {
      await setupLocalStream(isVideo);
      await createPeerConnection();

      const offer = await state.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });
      await state.pc.setLocalDescription(offer);

      Chat.sendWSPacket('call_offer', {
        chat_id: chatId,
        sdp:     offer.sdp,
        type:    offer.type,
        is_video: isVideo,
      });
    } catch (err) {
      console.error('[WebRTC] startCall error:', err);
      UI.Toast.error('Не удалось начать звонок');
      endCall();
    }
  }

  /* ─────────────────────────────────────── */
  /*  HANDLE INCOMING CALL                   */
  /* ─────────────────────────────────────── */
  function handleIncoming(data) {
    state.pendingOffer = data;

    const popup = $('incoming-call');
    if (!popup) return;

    popup.classList.add('show');
    popup.querySelector('.incoming-call-name').textContent = data.caller_name || 'Неизвестный';
    popup.querySelector('.incoming-call-type').textContent = data.is_video ? '📹 Видеозвонок' : '📞 Голосовой звонок';

    const acceptBtn = popup.querySelector('#btn-accept-call');
    const declineBtn = popup.querySelector('#btn-decline-call');

    const cleanup = () => popup.classList.remove('show');

    acceptBtn.onclick = async () => {
      cleanup();
      await acceptCall(data);
    };
    declineBtn.onclick = () => {
      cleanup();
      Chat.sendWSPacket('call_end', { chat_id: data.chat_id, reason: 'declined' });
    };

    // Auto-dismiss after 30s
    setTimeout(cleanup, 30000);
  }

  async function acceptCall(data) {
    state.chatId      = data.chat_id;
    state.isVideo     = data.is_video;
    state.isInitiator = false;

    showCallOverlay({
      name:    data.caller_name,
      avatar:  data.caller_avatar,
      isVideo: data.is_video,
      status:  'connected',
    });

    try {
      await setupLocalStream(data.is_video);
      await createPeerConnection();

      await state.pc.setRemoteDescription({ type: data.type, sdp: data.sdp });

      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);

      Chat.sendWSPacket('call_answer', {
        chat_id: data.chat_id,
        sdp:     answer.sdp,
        type:    answer.type,
      });

      startTimer();
    } catch (err) {
      console.error('[WebRTC] acceptCall error:', err);
      UI.Toast.error('Ошибка подключения');
      endCall();
    }
  }

  /* ─────────────────────────────────────── */
  /*  HANDLE SIGNALING                       */
  /* ─────────────────────────────────────── */
  async function handleAnswer(data) {
    if (!state.pc) return;
    try {
      await state.pc.setRemoteDescription({ type: data.type, sdp: data.sdp });
      setCallStatus('connected');
      startTimer();
    } catch (err) {
      console.error('[WebRTC] handleAnswer error:', err);
    }
  }

  async function handleIce(data) {
    if (!state.pc || !data.candidate) return;
    try {
      await state.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch {}
  }

  function handleEnd(data) {
    const reason = data?.reason;
    if (reason === 'declined') UI.Toast.info('Звонок отклонён');
    endCall(false);
  }

  /* ─────────────────────────────────────── */
  /*  PEER CONNECTION                        */
  /* ─────────────────────────────────────── */
  async function createPeerConnection() {
    state.pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    state.localStream?.getTracks().forEach(track => {
      state.pc.addTrack(track, state.localStream);
    });

    // ICE candidates
    state.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        Chat.sendWSPacket('call_ice', {
          chat_id:   state.chatId,
          candidate: candidate.toJSON(),
        });
      }
    };

    // Connection state
    state.pc.onconnectionstatechange = () => {
      switch (state.pc.connectionState) {
        case 'connected':
          setCallStatus('connected');
          if (!state.timerInterval) startTimer();
          break;
        case 'disconnected':
        case 'failed':
          UI.Toast.error('Соединение прервано');
          endCall(false);
          break;
      }
    };

    // Remote stream
    state.remoteStream = new MediaStream();
    state.pc.ontrack = ({ track }) => {
      state.remoteStream.addTrack(track);
      const remoteVideo = $('remote-video');
      if (remoteVideo) remoteVideo.srcObject = state.remoteStream;
    };
  }

  /* ─────────────────────────────────────── */
  /*  MEDIA                                  */
  /* ─────────────────────────────────────── */
  async function setupLocalStream(withVideo) {
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo ? { width: 1280, height: 720, facingMode: 'user' } : false,
      });

      const selfVideo = $('self-video');
      if (selfVideo) selfVideo.srcObject = state.localStream;
    } catch (err) {
      if (err.name === 'NotFoundError') throw new Error('Микрофон/камера не найдены');
      if (err.name === 'NotAllowedError') throw new Error('Нет доступа к микрофону/камере');
      throw err;
    }
  }

  /* ─────────────────────────────────────── */
  /*  CONTROLS                               */
  /* ─────────────────────────────────────── */
  function toggleMute() {
    if (!state.localStream) return;
    state.isMuted = !state.isMuted;
    state.localStream.getAudioTracks().forEach(t => { t.enabled = !state.isMuted; });

    const btn = $('btn-mute');
    if (btn) {
      btn.classList.toggle('call-btn-muted', state.isMuted);
      btn.innerHTML = state.isMuted ? UI.Icons.micOff() : UI.Icons.mic();
      btn.title = state.isMuted ? 'Включить микрофон' : 'Выключить микрофон';
    }
  }

  function toggleVideo() {
    if (!state.localStream) return;
    state.isVideoOff = !state.isVideoOff;
    state.localStream.getVideoTracks().forEach(t => { t.enabled = !state.isVideoOff; });

    const btn = $('btn-video');
    if (btn) {
      btn.classList.toggle('call-btn-muted', state.isVideoOff);
      btn.innerHTML = state.isVideoOff ? UI.Icons.videoOff() : UI.Icons.video();
    }
  }

  async function toggleScreenShare() {
    if (!state.pc) return;

    if (!state.isSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack  = screenStream.getVideoTracks()[0];

        // Replace video track in peer connection
        const sender = state.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);

        // Show self-view with screen
        const selfVideo = $('self-video');
        if (selfVideo) selfVideo.srcObject = screenStream;

        state.isSharing = true;
        $('btn-screen')?.classList.add('call-btn-default', 'active');

        screenTrack.onended = () => toggleScreenShare();
      } catch {}
    } else {
      // Restore camera
      const camTrack = state.localStream?.getVideoTracks()[0];
      if (camTrack) {
        const sender = state.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);

        const selfVideo = $('self-video');
        if (selfVideo) selfVideo.srcObject = state.localStream;
      }
      state.isSharing = false;
      $('btn-screen')?.classList.remove('active');
    }
  }

  /* ─────────────────────────────────────── */
  /*  END CALL                               */
  /* ─────────────────────────────────────── */
  function endCall(notify = true) {
    if (notify && state.chatId) {
      Chat.sendWSPacket('call_end', { chat_id: state.chatId });
    }

    // Stop all tracks
    state.localStream?.getTracks().forEach(t => t.stop());
    state.remoteStream?.getTracks().forEach(t => t.stop());

    state.pc?.close();

    clearInterval(state.timerInterval);

    // Reset state
    state = {
      ...state,
      pc:            null,
      localStream:   null,
      remoteStream:  null,
      chatId:        null,
      isVideo:       false,
      isInitiator:   false,
      isMuted:       false,
      isVideoOff:    false,
      isSharing:     false,
      callActive:    false,
      timerInterval: null,
      seconds:       0,
    };

    hideCallOverlay();
  }

  /* ─────────────────────────────────────── */
  /*  UI                                     */
  /* ─────────────────────────────────────── */
  function showCallOverlay({ name, avatar, isVideo, status }) {
    state.callActive = true;

    const overlay = $('call-overlay');
    if (!overlay) return;

    // Fill in info
    overlay.querySelector('.call-header-name').textContent  = name || '';
    overlay.querySelector('.call-header-type').textContent  = isVideo ? 'Видеозвонок' : 'Голосовой звонок';

    // Audio avatar
    const audioAv = overlay.querySelector('.call-audio-avatar');
    if (audioAv) {
      const av = avatar
        ? `<img src="${avatar}" class="avatar call-audio-ring" style="width:120px;height:120px" alt="">`
        : `<div class="call-audio-ring">${UI.avatarPlaceholder(name, 'xxl').outerHTML}</div>`;
      audioAv.querySelector('.call-audio-ring').outerHTML = av;
    }

    // Video tiles visibility
    overlay.querySelector('.call-video-grid').classList.toggle('hidden', !isVideo);
    overlay.querySelector('.call-audio-avatar')?.classList.toggle('hidden', isVideo);

    setCallStatus(status);

    overlay.classList.add('active');

    // Bind controls
    $('btn-mute')?.addEventListener('click', toggleMute);
    $('btn-video')?.addEventListener('click', toggleVideo);
    $('btn-screen')?.addEventListener('click', toggleScreenShare);
    $('btn-end-call')?.addEventListener('click', () => endCall(true));
  }

  function hideCallOverlay() {
    $('call-overlay')?.classList.remove('active');
  }

  function setCallStatus(status) {
    const el = $('call-status');
    if (!el) return;
    const labels = {
      calling:   '📞 Вызов...',
      connected: '🔴 Идёт звонок',
      declined:  'Звонок отклонён',
    };
    el.textContent = labels[status] || status;
    el.className   = `call-status ${status}`;
  }

  /* ─── Timer ──────────────────────────────── */
  function startTimer() {
    state.seconds = 0;
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.seconds++;
      const el = $('call-timer');
      if (el) el.textContent = UI.formatDuration(state.seconds);
    }, 1000);
  }

  return {
    startCall,
    handleIncoming,
    handleAnswer,
    handleIce,
    handleEnd,
    endCall,
    toggleMute,
    toggleVideo,
  };

})();

window.WebRTCCall = WebRTCCall;
