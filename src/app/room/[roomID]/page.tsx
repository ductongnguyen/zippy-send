// app/room/[roomID]/[userID]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Row, Col, Typography, Spin, Alert, Button } from 'antd';
import { AudioMutedOutlined, AudioOutlined, VideoCameraOutlined, StopOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import { wsNotificationsUrl } from '@/lib/config';
const { Title } = Typography;

// Định nghĩa cấu hình STUN server
const STUN_SERVER = "stun:stun.l.google.com:19302";

export default function RoomPage() {
    const params = useParams();
    const { roomID } = params;
    const { user } = useAuth();

    // State cho UI
    const [status, setStatus] = useState('connecting');
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    // Refs để lưu trữ các đối tượng không cần render lại
    const userVideoRef = useRef<HTMLVideoElement>(null);
    const userStreamRef = useRef<MediaStream>(null);
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const webSocketRef = useRef<WebSocket>(null);

    useEffect(() => {
        const getMedia = async () => {
            let stream: MediaStream | undefined;
            let hasVideoInitially = true;
            try {
                // 1. Ưu tiên lấy cả video và audio
                console.log("Attempting to get video and audio stream...");
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                stream.getAudioTracks().forEach(track => (track.enabled = !isMuted));
                stream.getVideoTracks().forEach(track => (track.enabled = !isVideoOff));
                userStreamRef.current = stream;

                stream.getTracks().forEach(track => {
                    peerConnectionsRef.current.forEach(pc => pc.addTrack(track, stream));
                });
            } catch (error: any) {
                // 2. Xử lý lỗi
                if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                    // Lỗi phổ biến khi không tìm thấy camera hoặc mic
                    console.warn("Camera not found. Falling back to audio-only.");
                    hasVideoInitially = false;
                    try {
                        // 3. Thử lại chỉ với audio
                        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                    } catch (audioError: any) {
                        // Nếu cả audio cũng không được, đây là lỗi nghiêm trọng
                        console.error("Could not get audio stream either.", audioError);
                        setStatus('error');
                        return; // Dừng thực thi
                    }
                } else {
                    // 4. Các lỗi khác (ví dụ: người dùng từ chối quyền) là lỗi nghiêm trọng
                    console.error("Error accessing media devices:", error);
                    setStatus('error');
                    return; // Dừng thực thi
                }
            }

            if (stream) {
                userStreamRef.current = stream;
                if (userVideoRef.current) {
                    userVideoRef.current.srcObject = stream;
                }

                setIsVideoOff(!hasVideoInitially);

                connectToWebSocket();
            }
        };

        const connectToWebSocket = () => {
            const wsURL = `${wsNotificationsUrl}?roomId=${roomID}&userId=${user?.id}`;
            webSocketRef.current = new WebSocket(wsURL);

            webSocketRef.current.onopen = () => {
                console.log("WebSocket connection established.");
                setStatus('connected');
            };

            webSocketRef.current.onmessage = (event) => {
                const message = JSON.parse(event.data);
                handleServerMessage(message);
            };

            webSocketRef.current.onclose = () => {
                console.log("WebSocket connection closed.");
                setStatus('disconnected');
            };

            webSocketRef.current.onerror = (error) => {
                console.error("WebSocket error:", error);
                setStatus('error');
            };
        };

        getMedia();

        return () => {
            webSocketRef.current?.close();
            userStreamRef.current?.getTracks().forEach(track => track.stop());
            peerConnectionsRef.current.forEach(pc => pc.close());
        };
    }, [roomID, user]);

    const handleServerMessage = (message: any) => {
        const { event, data, senderId } = message;

        switch (event) {
            case "room-joined":
                console.log(`Joined room. Current participants:`, data.participants);
                data.participants.forEach((participantId: string) => {
                    if (participantId !== user?.id) {
                        createPeerConnectionAndOffer(participantId);
                    }
                });
                break;
            case "participant-joined":
                console.log(`Participant ${data.joinedId} joined the room.`);
                break;
            case "participant-left":
                console.log(`Participant ${data.leftId} left the room.`);
                closePeerConnection(data.leftId);
                break;
            case "webrtc-offer":
                console.log(`Received WebRTC offer from ${senderId}`);
                handleOffer(senderId, data.payload);
                break;
            case "webrtc-answer":
                console.log(`Received WebRTC answer from ${senderId}`);
                handleAnswer(senderId, data.payload);
                break;
            case "ice-candidate":
                console.log(`Received ICE candidate from ${senderId}`);
                handleIceCandidate(senderId, data.payload);
                break;
            default:
                console.warn("Unknown message event:", event);
        }
    };

    const sendMessageToServer = (event: string, data: any) => {
        const message = { event, data };
        webSocketRef.current?.send(JSON.stringify(message));
    };

    const createPeerConnection = (peerId: string) => {
        if (peerConnectionsRef.current.has(peerId)) return peerConnectionsRef.current.get(peerId)!;

        const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_SERVER }] });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendMessageToServer('ice-candidate', { targetId: peerId, payload: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStreams(prev => new Map(prev).set(peerId, event.streams[0]));
        };

        userStreamRef.current?.getTracks().forEach(track => {
            pc.addTrack(track, userStreamRef.current!);
        });

        peerConnectionsRef.current.set(peerId, pc);
        return pc;
    };

    const createPeerConnectionAndOffer = async (peerId: string) => {
        console.log(`Creating offer for ${peerId}`);
        const pc = createPeerConnection(peerId);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendMessageToServer('webrtc-offer', { targetId: peerId, payload: offer });
        } catch (error) {
            console.error(`Error creating offer for ${peerId}:`, error);
        }
    };

    const handleOffer = async (senderId: string, offer: RTCSessionDescriptionInit) => {
        const pc = createPeerConnection(senderId);

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendMessageToServer('webrtc-answer', { targetId: senderId, payload: answer });
        } catch (error) {
            console.error(`Error handling offer from ${senderId}:`, error);
        }
    };

    const handleAnswer = async (senderId: string, answer: RTCSessionDescriptionInit) => {
        const pc = peerConnectionsRef.current.get(senderId);
        if (pc) {
            if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } else {
                console.warn("Can't set answer: signaling state is", pc.signalingState);
            }
        }
    };

    const handleIceCandidate = async (senderId: string, candidate: RTCIceCandidateInit) => {
        const pc = peerConnectionsRef.current.get(senderId);
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    };

    const closePeerConnection = (peerId: string) => {
        peerConnectionsRef.current.get(peerId)?.close();
        peerConnectionsRef.current.delete(peerId);
        setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.delete(peerId);
            return newMap;
        });
    };

    const toggleAudio = () => {

        peerConnectionsRef.current.forEach((pc) => {

            pc.getSenders().forEach(sender => {
                if (sender.track?.kind === 'audio') {
                    sender.track.enabled = !sender.track.enabled;
                }
            });
        });
        setIsMuted(prev => !prev);
    };


    const toggleVideo = () => {
        peerConnectionsRef.current.forEach((pc) => {
            pc.getSenders().forEach(sender => {
                if (sender.track?.kind === 'video') {
                    sender.track.enabled = !sender.track.enabled;
                }
            });
        });
        setIsVideoOff(prev => !prev);
    };


    return (
        <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
            <Title level={2}>Room: <span style={{ color: '#1890ff' }}>{roomID}</span> | User: <span style={{ color: '#1890ff' }}>{user?.id}</span></Title>

            {status !== 'connected' && (
                <Alert
                    message={status.charAt(0).toUpperCase() + status.slice(1)}
                    description={
                        status === 'connecting' ? 'Attempting to connect to the room...' :
                            status === 'error' ? 'A connection error occurred.' :
                                'You have been disconnected.'
                    }
                    type={status === 'connecting' ? 'info' : 'error'}
                    showIcon
                    icon={status === 'connecting' && <Spin />}
                    style={{ marginBottom: '24px' }}
                />
            )}

            <Row gutter={[16, 16]}>
                Your Video
                <Col xs={24} md={12} lg={8}>
                    <Card title="You" style={{ padding: 0 }}>
                        <video ref={userVideoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block' }} />
                        <div style={{ padding: '12px', display: 'flex', justifyContent: 'center', gap: '16px' }}>
                            <Button icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />} onClick={toggleAudio} danger={isMuted}>
                                {isMuted ? 'Unmute' : 'Mute'}
                            </Button>
                            <Button icon={isVideoOff ? <StopOutlined /> : <VideoCameraOutlined />} onClick={toggleVideo} danger={isVideoOff}>
                                {isVideoOff ? 'Cam On' : 'Cam Off'}
                            </Button>
                        </div>
                    </Card>
                </Col>

                {/* Remote Videos */}
                {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
                    <Col key={peerId} xs={24} md={12} lg={8}>
                        <Card title={`Peer: ${peerId}`} style={{ padding: 0 }}>
                            <video
                                autoPlay
                                playsInline
                                style={{ width: '100%', display: 'block' }}
                                ref={video => {
                                    if (video && video.srcObject !== stream) {
                                        video.srcObject = stream;
                                    }
                                }}
                            />
                        </Card>
                    </Col>
                ))}
            </Row>
        </div>
    );
}