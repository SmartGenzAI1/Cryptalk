'use client'

import { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, ShieldCheck, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatAvatar } from './chat-avatar'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getSocket } from '@/hooks/use-socket'
import type { SafeUser, ChatWithMembers } from '@/lib/types'

interface VoiceCallModalProps {
  open: boolean
  onClose: () => void
  chat: ChatWithMembers | null
  currentUser: SafeUser | null
  isIncoming?: boolean
  incomingOfferData?: any
  isVideoCall?: boolean
}

export function VoiceCallModal({
  open,
  onClose,
  chat,
  currentUser,
  isIncoming = false,
  incomingOfferData = null,
  isVideoCall: initialIsVideo = false,
}: VoiceCallModalProps) {
  const isVideoCall = incomingOfferData?.isVideoCall ?? initialIsVideo

  const [callState, setCallState] = useState<'calling' | 'incoming' | 'connected' | 'ended'>(
    isIncoming ? 'incoming' : 'calling'
  )
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [duration, setDuration] = useState(0)
  const [otherUser, setOtherUser] = useState<SafeUser | null>(null)

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingCandidatesRef = useRef<any[]>([])

  // Maximum call limit: 10 minutes (600 seconds)
  const MAX_CALL_SECONDS = 600

  // Repeat incoming ringtone 3 times for incoming calls
  useEffect(() => {
    if (open && callState === 'incoming') {
      let count = 0
      let cancelled = false
      const playRingtone = () => {
        if (cancelled || count >= 3) return
        count++
        try {
          const audio = new Audio('/sounds/income-messaage.mp3')
          audio.onended = () => {
            if (!cancelled && count < 3) {
              setTimeout(playRingtone, 400)
            }
          }
          audio.play().catch(() => {})
        } catch (_) {}
      }
      playRingtone()
      return () => {
        cancelled = true
      }
    }
  }, [open, callState])

  useEffect(() => {
    if (!chat || !currentUser) return
    const recipient = chat.members.find((m) => m.user.id !== currentUser.id)
    if (recipient) setOtherUser(recipient.user)
  }, [chat, currentUser])

  async function flushPendingCandidates() {
    if (!peerRef.current || !peerRef.current.remoteDescription) return
    while (pendingCandidatesRef.current.length > 0) {
      const cand = pendingCandidatesRef.current.shift()
      if (cand) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(cand))
        } catch (e) {
          console.warn('Failed adding queued ICE candidate:', e)
        }
      }
    }
  }

  useEffect(() => {
    if (!open) return
    const socket = getSocket()
    if (!socket) return

    const handleAnswer = async (data: any) => {
      if (peerRef.current && data.sdp) {
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp))
          await flushPendingCandidates()
          setCallState('connected')
          startDurationTimer()
        } catch (e) {
          console.warn('Failed to set remote answer:', e)
        }
      }
    }

    const handleIceCandidate = async (data: any) => {
      if (data.candidate) {
        if (peerRef.current && peerRef.current.remoteDescription) {
          try {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch (e) {
            console.warn('Failed to add ICE candidate:', e)
          }
        } else {
          pendingCandidatesRef.current.push(data.candidate)
        }
      }
    }

    const handleHangup = () => {
      endCall('Call ended by remote user')
    }

    socket.on('call-answer', handleAnswer)
    socket.on('ice-candidate', handleIceCandidate)
    socket.on('call-hangup', handleHangup)

    if (!isIncoming) {
      startOutgoingCall()
    }

    return () => {
      socket.off('call-answer', handleAnswer)
      socket.off('ice-candidate', handleIceCandidate)
      socket.off('call-hangup', handleHangup)
      cleanupMedia()
    }
  }, [open, isIncoming])

  function startDurationTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setDuration(0)
    timerRef.current = setInterval(() => {
      setDuration((sec) => {
        if (sec >= MAX_CALL_SECONDS - 1) {
          toast.warning('Maximum 10-minute call limit reached. Disconnecting call.')
          endCall('10-minute maximum call limit reached')
          return MAX_CALL_SECONDS
        }
        return sec + 1
      })
    }, 1000)
  }

  async function createPeerConnection(targetUserId: string): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideoCall ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    })
    localStreamRef.current = stream

    if (isVideoCall && localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }

    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket()
        socket?.emit('ice-candidate', {
          targetUserId,
          candidate: event.candidate,
        })
      }
    }

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0]
        if (isVideoCall && remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
      }
    }

    peerRef.current = pc
    return pc
  }

  async function startOutgoingCall() {
    if (!otherUser || !chat) return
    try {
      const pc = await createPeerConnection(otherUser.id)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const socket = getSocket()
      socket?.emit('call-offer', {
        chatId: chat.id,
        targetUserId: otherUser.id,
        sdp: offer,
        isVideoCall,
      })
    } catch (e) {
      toast.error(isVideoCall ? 'Camera/microphone access required for video call' : 'Microphone access required for voice call')
      onClose()
    }
  }

  async function acceptIncomingCall() {
    if (!incomingOfferData || !otherUser) return
    try {
      const pc = await createPeerConnection(incomingOfferData.callerUserId)
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferData.sdp))
      await flushPendingCandidates()

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      const socket = getSocket()
      socket?.emit('call-answer', {
        callerUserId: incomingOfferData.callerUserId,
        sdp: answer,
      })

      setCallState('connected')
      startDurationTimer()
    } catch (e) {
      toast.error('Failed to accept call')
      onClose()
    }
  }

  function toggleMute() {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = muted))
      setMuted(!muted)
    }
  }

  function toggleVideo() {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = videoOff))
      setVideoOff(!videoOff)
    }
  }

  function endCall(reason?: string) {
    if (otherUser) {
      const socket = getSocket()
      socket?.emit('call-hangup', { targetUserId: otherUser.id })
    }
    cleanupMedia()
    setCallState('ended')
    if (reason) toast.info(reason)
    setTimeout(onClose, 800)
  }

  function cleanupMedia() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    if (peerRef.current) {
      peerRef.current.close()
      peerRef.current = null
    }
  }

  if (!open || !otherUser) return null

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
      >
        <audio ref={remoteAudioRef} autoPlay />

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className={`relative w-full ${isVideoCall ? 'max-w-4xl h-[85vh]' : 'max-w-sm'} bg-card/90 border border-border/80 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-between overflow-hidden`}
        >
          {/* Video Stream Container */}
          {isVideoCall && callState === 'connected' ? (
            <div className="absolute inset-0 z-0 bg-black rounded-3xl overflow-hidden">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute top-4 right-4 w-28 h-40 rounded-2xl border-2 border-emerald-500/80 object-cover shadow-2xl bg-black/60"
              />
            </div>
          ) : null}

          {/* E2EE Security Badge */}
          <div className="relative z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold backdrop-blur-md border border-emerald-500/30">
            <ShieldCheck className="h-4 w-4" />
            <span>Encrypted {isVideoCall ? 'Video' : 'Voice'} Call</span>
          </div>

          {/* User Avatar & Info (shown in voice mode or when video not connected) */}
          {(!isVideoCall || callState !== 'connected') && (
            <div className="relative z-10 flex flex-col items-center my-auto">
              <div className="relative mb-4">
                <ChatAvatar
                  emoji={otherUser.avatarEmoji}
                  color={otherUser.avatarColor}
                  size="lg"
                  userId={otherUser.id}
                />
                {callState === 'connected' && (
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
                  </span>
                )}
              </div>

              <h3 className="text-xl font-bold tracking-tight mb-1">{otherUser.name}</h3>
              <p className="text-xs text-muted-foreground mb-4">@{otherUser.username}</p>
            </div>
          )}

          {/* Status / Live Duration */}
          <div className="relative z-10 my-4 bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10">
            {callState === 'calling' ? (
              <p className="text-sm font-medium text-amber-400 animate-pulse">
                Calling {otherUser.name} ({isVideoCall ? 'Video' : 'Voice'})…
              </p>
            ) : callState === 'incoming' ? (
              <p className="text-sm font-semibold text-emerald-400 animate-pulse">
                Incoming {isVideoCall ? 'Video' : 'Voice'} Call
              </p>
            ) : callState === 'connected' ? (
              <div className="flex items-center gap-1.5 text-base font-mono font-bold text-emerald-400">
                <Clock className="h-4 w-4 animate-spin text-emerald-400/80" />
                <span>{formatTimer(duration)}</span>
                <span className="text-[10px] font-sans font-normal text-white/70 ml-1">/ 10:00 max</span>
              </div>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">Call Ended</p>
            )}
          </div>

          {/* Controls Bar */}
          {callState === 'incoming' ? (
            <div className="relative z-10 flex items-center justify-center gap-6 w-full pb-2">
              <Button
                size="icon"
                onClick={() => endCall('Call declined')}
                className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xl zc-tap"
                title="Decline"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                size="icon"
                onClick={acceptIncomingCall}
                className="h-14 w-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl zc-tap animate-bounce"
                title="Accept"
              >
                <Phone className="h-6 w-6" />
              </Button>
            </div>
          ) : (
            <div className="relative z-10 flex items-center justify-center gap-4 w-full pb-2">
              <Button
                size="icon"
                variant="secondary"
                onClick={toggleMute}
                disabled={callState !== 'connected'}
                className="h-12 w-12 rounded-full zc-tap bg-white/20 hover:bg-white/30 text-white backdrop-blur"
                title={muted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {muted ? <MicOff className="h-5 w-5 text-red-400" /> : <Mic className="h-5 w-5" />}
              </Button>

              {isVideoCall && (
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={toggleVideo}
                  disabled={callState !== 'connected'}
                  className="h-12 w-12 rounded-full zc-tap bg-white/20 hover:bg-white/30 text-white backdrop-blur"
                  title={videoOff ? 'Turn Video On' : 'Turn Video Off'}
                >
                  {videoOff ? <VideoOff className="h-5 w-5 text-red-400" /> : <Video className="h-5 w-5" />}
                </Button>
              )}

              <Button
                size="icon"
                onClick={() => endCall()}
                className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xl zc-tap"
                title="Hang Up"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
