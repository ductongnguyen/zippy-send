'use client'
import { Button, Card, Input, Layout, List, message, notification, Progress, Space, Tooltip, Typography, Upload } from 'antd'
import { CheckCircleOutlined, DeleteOutlined, DownloadOutlined, FileOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons'
import type { NotificationArgsProps, UploadFile, UploadProps } from 'antd'
import type { RcFile } from 'antd/es/upload/interface'
import { useState, useRef, useEffect } from 'react'
import Dragger from 'antd/es/upload/Dragger'
import QRCodeStyling from 'qr-code-styling'
import Pusher from 'pusher-js'
import JSZip from 'jszip';

const { Content } = Layout

const servers = {
  iceServers: [
    { urls: process.env.NEXT_PUBLIC_STUN_URL! },
    {
      urls: [
        process.env.NEXT_PUBLIC_TURN_URL_80!,
        process.env.NEXT_PUBLIC_TURN_URL_80_TCP!,
        process.env.NEXT_PUBLIC_TURN_URL_443!,
        process.env.NEXT_PUBLIC_TURNS_URL_443_TCP!
      ],
      username: process.env.NEXT_PUBLIC_TURN_USERNAME!,
      credential: process.env.NEXT_PUBLIC_TURN_PASSWORD!,
    }
  ],
  iceCandidatePoolSize: 10,
}

interface ReceivingFile {
  name: string
  size: number
  type?: string
  totalChunks: number
  chunks: ArrayBuffer[]
  receivedSize: number
  isCompleted?: boolean
}

type SendingState = 'idle' | 'waiting' | 'sending' | 'completed';

export default function Home() {
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const qrRef = useRef<HTMLDivElement>(null)
  const [qrCode, setQrCode] = useState<QRCodeStyling | null>(null)
  const [code, setCode] = useState<string>('')
  const [isSending, setIsSending] = useState(false)
  const [countdown, setCountdown] = useState(600)

  const [receiveCode, setReceiveCode] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState<Map<string, ReceivingFile>>(new Map());
  const [sendingState, setSendingState] = useState<SendingState>('idle');
  const [allDownloadsComplete, setAllDownloadsComplete] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<any | null>(null);

  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const notifiedFilesRef = useRef<Set<string>>(new Set());

  const cleanup = () => {
    console.error('%cCLEANUP FUNCTION CALLED!', 'color: red; font-size: 14px;');

    if (channelRef.current) {
      channelRef.current.unbind_all();
      pusherRef.current?.unsubscribe(channelRef.current.name);
      channelRef.current = null;
    }
    dataChannelRef.current?.close()
    peerConnectionRef.current?.close()
    dataChannelRef.current = null
    peerConnectionRef.current = null
    candidateQueueRef.current = []
  }

  useEffect(() => {
    if (!pusherRef.current) {
      pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: '/api/pusher/auth',
      });
      console.log('Pusher instance created.');
    }

    return () => {
      if (pusherRef.current?.connection.state === 'connected') {
        console.log("Disconnecting Pusher on component unmount");
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
    };
  }, []);

  // useEffect(() => {
  //   if (code && qrRef.current) {
  //     if (qrCode) qrCode.update({ data: code });
  //     else {
  //       const qr = new QRCodeStyling({
  //         width: 240, height: 240, type: 'canvas', data: code, image: '/logo.svg',
  //         dotsOptions: { color: '#000', type: 'rounded' },
  //         imageOptions: { crossOrigin: 'anonymous', margin: 4, imageSize: 0.3 },
  //       });
  //       qr.append(qrRef.current);
  //       setQrCode(qr);
  //     }
  //   }
  // }, [code, qrCode])

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sendingState === 'waiting') {
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            cancelAndResetSender();
            message.warning('No receiver connected. Session expired.');
            return 600;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sendingState]);

  const sendSignal = async (signalCode: string, eventName: string, data: any) => {
    await fetch('/api/pusher/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: signalCode, event: eventName, data }),
    })
  }

  // helper to add candidate or queue if remote desc not set
  const handleRemoteCandidate = async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (pc.remoteDescription && pc.remoteDescription.type) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      candidateQueueRef.current.push(candidate);
    }
  }

  const flushCandidateQueue = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    while (candidateQueueRef.current.length) {
      await pc.addIceCandidate(new RTCIceCandidate(candidateQueueRef.current.shift()!));
    }
  }

  const initializeSenderPeerConnection = async (senderCode: string) => {
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    const dataChannel = pc.createDataChannel('file-transfer');
    dataChannelRef.current = dataChannel;

    dataChannel.onopen = () => {
      message.success('Connection established! Sending files...');
      setCountdown(9999);
      setSendingState('sending');
      sendFiles(dataChannel);
    };

    dataChannel.onclose = () => {
      resetSenderUI();
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(senderCode, 'ice-candidate', event.candidate);
      }
    };

    const channelName = `private-${senderCode}`;
    channelRef.current = pusherRef.current?.subscribe(channelName);

    channelRef.current?.bind('ready', async (data: any) => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(senderCode, 'offer', offer);
    });

    channelRef.current?.bind('answer', async (data: any) => {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      await flushCandidateQueue();
    });

    channelRef.current?.bind('ice-candidate', async (data: any) => {
      await handleRemoteCandidate(data);
    });
  };

  const sendFiles = async (dc: RTCDataChannel) => {
    for (const file of fileList) {
      const f = file.originFileObj as File
      const chunkSize = 64 * 1024
      const totalChunks = Math.ceil(f.size / chunkSize)

      // Gửi meta trước
      dc.send(JSON.stringify({
        type: 'meta',
        name: f.name,
        size: f.size,
        totalChunks
      }))

      let offset = 0
      let index = 0

      while (offset < f.size) {
        if (dc.bufferedAmount > 4 * 1024 * 1024) {
          await new Promise<void>(resolve => {
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null
              resolve()
            }
          })
        }

        const slice = f.slice(offset, offset + chunkSize)
        const buf = await slice.arrayBuffer()

        // Header + Data
        const header = new ArrayBuffer(8)
        const view = new DataView(header)
        view.setUint32(0, index)
        view.setUint32(4, totalChunks)

        const packet = new Uint8Array(header.byteLength + buf.byteLength)
        packet.set(new Uint8Array(header), 0)
        packet.set(new Uint8Array(buf), header.byteLength)

        dc.send(packet.buffer)

        offset += buf.byteLength
        index++
        setFileList(prev => prev.map(item =>
          item.uid === file.uid
            ? { ...item, percent: Math.round((offset / f.size) * 100) }
            : item
        ))
      }

      await new Promise<void>(r => {
        const check = () => {
          if (dc.bufferedAmount === 0) r()
          else setTimeout(check, 50)
        }
        check()
      })
      dc.send(JSON.stringify({ type: 'isCompleted', name: f.name }))
    }
    setSendingState('completed')
  }


  const lastProgressUpdateRef = useRef(0)

  const handleIncomingFile = (event: MessageEvent) => {
    const d = event.data

    if (typeof d === 'string') {
      const m = JSON.parse(d)
      if (m.type === 'meta') {
        setReceivedFiles(prev => {
          const m2 = new Map(prev)
          m2.set(m.name, {
            name: m.name,
            size: m.size,
            chunks: new Array(m.totalChunks),
            receivedSize: 0,
            totalChunks: m.totalChunks,
            isCompleted: false
          })
          return m2
        })
      } else if (m.type === 'isCompleted') {
        setReceivedFiles(prev => {
          const newMap = new Map(prev)
          const file = newMap.get(m.name)
          if (file && file.chunks.every(Boolean)) {
            const blob = new Blob(file.chunks)
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = file.name
            newMap.set(m.name, { ...file, isCompleted: true })
          }
          return newMap
        })
      }
      return
    }

    if (d instanceof ArrayBuffer) {
      const view = new DataView(d)
      const index = view.getUint32(0)
      const totalChunks = view.getUint32(4)
      const chunkData = d.slice(8)

      setReceivedFiles(prev => {
        const m2 = new Map(prev)
        for (const [name, file] of m2.entries()) {
          if (file.totalChunks === totalChunks) {
            file.chunks[index] = chunkData
            file.receivedSize += chunkData.byteLength

            const now = Date.now()
            if (now - lastProgressUpdateRef.current > 200) {
              const pct = Math.round((file.receivedSize / file.size) * 100)
              lastProgressUpdateRef.current = now
            }
            break
          }
        }
        return m2
      })
    }
  }



  useEffect(() => {
    let allDone = receivedFiles.size > 0;

    receivedFiles.forEach((file, name) => {
      if (file.receivedSize >= file.size && !notifiedFilesRef.current.has(name)) {
        console.log(file.receivedSize / file.size)
      }

      if (file.receivedSize >= file.size) {
        allDone = false;
      }
    });

    setAllDownloadsComplete(allDone);

  }, [receivedFiles]);

  const resetReceiverState = () => {
    setIsReceiving(false);
    setReceiveCode('');
    setReceivedFiles(new Map());
    if (notifiedFilesRef.current) {
      notifiedFilesRef.current.clear();
    }
    cleanup();
  };


  const initializeReceiverPeerConnection = async (receiverCode: string) => {
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      dataChannelRef.current = channel;

      channel.onmessage = handleIncomingFile;
      channel.onopen = () => {
        message.success("DataChannel opened. Ready to receive files.");
      };
      channel.onclose = () => {
        console.log("DataChannel closed.");
        resetReceiverState();
      };
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(receiverCode, 'ice-candidate', event.candidate);
      }
    };

    const channelName = `private-${receiverCode}`;
    channelRef.current = pusherRef.current?.subscribe(channelName);

    sendSignal(receiverCode, 'ready', {});

    channelRef.current?.bind('offer', async (data: any) => {
      await pc.setRemoteDescription(new RTCSessionDescription(data));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal(receiverCode, 'answer', answer);

      await flushCandidateQueue();
    });

    channelRef.current?.bind('ice-candidate', async (data: any) => {
      await handleRemoteCandidate(data);
    });
  };

  const handleSend = () => {
    cleanup();
    if (fileList.length === 0) {
      message.error('Please select at least one file to send.');
      return;
    }
    setIsSending(true);
    setSendingState('waiting');
    setCountdown(600);
    const newCode = Math.random().toString(36).slice(-6).toUpperCase();
    setCode(newCode);
    if (qrRef.current) qrRef.current.innerHTML = '';
    initializeSenderPeerConnection(newCode);
  };

  const handleReceive = () => {
    if (!receiveCode || receiveCode.length !== 6) {
      message.error('Please enter a valid 6-character code.');
      return;
    }


    setIsReceiving(true)
    initializeReceiverPeerConnection(receiveCode.toUpperCase());
  };

  const handleDownloadAllZip = () => {
    const zip = new JSZip();

    receivedFiles.forEach((file) => {
      const blob = new Blob(file.chunks, { type: file.type });
      zip.file(file.name, blob);
    });

    zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `all_${receiveCode}_files.zip`;
      link.click();
    });
  };

  const resetSenderUI = () => {
    setIsSending(false);
    setFileList([]);
    setCode('');
    setSendingState('idle');
  };




  const cancelAndResetSender = () => {
    cleanup();
    setSendingState('idle');
    setFileList([]);
    setCode('');
  };


  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const props: UploadProps = {
    name: 'file', multiple: true, itemRender: () => null, beforeUpload: () => false,
    onChange(info) { setFileList(info.fileList); },
    onDrop(e) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const newUploadFiles: UploadFile[] = droppedFiles.map((file) => ({
        uid: `${file.name}-${file.lastModified}`,
        name: file.name, status: 'done',
        originFileObj: file as RcFile,
      }));
      setFileList((prev) => [...prev, ...newUploadFiles]);
    },
    fileList,
  };


  return (
    <Content style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '800px', padding: '24px 16px', display: 'flex', flexDirection: 'column', marginTop: 80, gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center' }}>Welcome to Zippy Send!</h1>
          <h2 style={{ fontSize: '1rem', marginBottom: '16px', textAlign: 'center' }}>Just tap. Just send. Just Zippy.</h2>

          {!isReceiving ? (
            fileList.length === 0 ? (
              <Dragger {...props} style={{ width: '100%', color: '#E53935' }}>
                <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#E53935' }} /></p>
                <p className="ant-upload-text">Click or drag file to this area to upload</p>
                <p className="ant-upload-hint">You can upload one or multiple files at once.</p>
              </Dragger>
            ) : (
              <Card title="Uploaded Files" style={{ width: '100%' }} hidden={isSending}
                extra={
                  <Upload multiple showUploadList={false} beforeUpload={() => false}
                    onChange={(info) => {
                      setFileList((prev) => {
                        const existingUids = new Set(prev.map(file => file.uid));
                        const uniqueNewFiles = info.fileList.filter(file => !existingUids.has(file.uid));
                        return [...prev, ...uniqueNewFiles];
                      });
                    }} disabled={isSending} >
                    <Button icon={<InboxOutlined />}>Add more</Button>
                  </Upload>
                }
                actions={[<SendOutlined style={{ fontSize: '16px', color: '#E53935' }} key="send" onClick={handleSend} />]}
              >
                <div style={{ maxHeight: '300px', overflowY: 'auto', width: '100%' }}>
                  <List bordered dataSource={fileList}
                    renderItem={(file) => (
                      <List.Item key={file.uid} style={{ padding: '12px 16px' }}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileOutlined className="text-lg text-blue-500" />
                            <Typography.Text ellipsis={{ tooltip: file.name }} className="text-sm" style={{ maxWidth: '100%' }}>
                              {file.name}
                            </Typography.Text>
                          </div>
                          <Button type="text" icon={<DeleteOutlined />} danger onClick={() => setFileList((prev) => prev.filter((f) => f.uid !== file.uid))} disabled={isSending} />
                        </div>
                      </List.Item>
                    )} />
                </div>
              </Card>
            )
          ) : null}

          {sendingState === 'waiting' && fileList.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="text-sm text-gray-500 text-center mt-2">
                <p>Enter the 6-digit key on the receiving device.</p>
                {countdown < 601 && (
                  <>Expires in <span className="font-mono text-red-500">{formatTime(countdown)}</span></>
                )}
              </div>
              <Card className="cursor-pointer bg-gray-100 hover:bg-gray-200 rounded-xl px-4 py-3 flex justify-center gap-2 select-all" onClick={() => navigator.clipboard.writeText(code)}>
                {code.split("").map((char, idx) => (<span key={idx} className="text-2xl font-semibold">{char}</span>))}
              </Card>
              {/* <Typography.Text strong style={{ textAlign: 'center', marginTop: 12 }}>Scan QR to receive files:</Typography.Text>
              <div ref={qrRef} style={{ marginTop: 12 }} /> */}
            </div>
          )}
          {sendingState === 'sending' && (
            <Card title="Sending Files..." style={{ width: '100%', marginTop: '24px' }}>
              <List
                dataSource={fileList}
                renderItem={(file) => (
                  <List.Item>
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileOutlined />
                      <Typography.Text style={{ flex: 1 }} ellipsis={{ tooltip: file.name }}>{file.name}</Typography.Text>
                      <Progress percent={file.percent || 0} size="small" style={{ width: '50%' }} />
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          )}

          {sendingState === 'completed' && (
            <Card title="Transfer Completed" style={{ width: '100%', marginTop: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <Typography.Title level={4}>All files sent successfully!</Typography.Title>
                <Button type="primary" onClick={resetSenderUI} style={{ marginTop: 16 }}>
                  Send More Files
                </Button>
              </div>
            </Card>
          )}
        </div>



        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          { !isSending&&!(isReceiving && receivedFiles.size > 0) && (
            <Card title={<div className="text-xl font-semibold text-center text-gray-800">Receive Files</div>} style={{ width: '100%', maxWidth: '500px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input placeholder="Enter code to download files..." size="large" style={{ fontSize: '16px' }}
                    value={receiveCode}
                    onChange={(e) => setReceiveCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    disabled={isReceiving}
                  />
                  <Button type="primary" size="large" icon={<DownloadOutlined />}
                    style={{ background: '#E53935', borderColor: '#E53935', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={handleReceive} loading={isReceiving}
                  > Download </Button>
                </Space.Compact>
                <div style={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>
                  Enter the code provided by the sender to download files
                </div>
              </div>
            </Card>
          )}

          {isReceiving && receivedFiles.size > 0 && (
            <Card title="Downloading..." extra={
              <Space>
                <Button
                  danger={!Array.from(receivedFiles.values()).every(f => f.isCompleted)}
                  onClick={resetReceiverState}
                >
                  {Array.from(receivedFiles.values()).every(f => f.isCompleted) ? 'Clear' : 'Cancel'}
                </Button>
                <Button icon={<DownloadOutlined />} onClick={handleDownloadAllZip} disabled={!Array.from(receivedFiles.values()).every(f => f.isCompleted)}>
                  Download All
                </Button>
              </Space>
            } style={{ width: '100%', maxWidth: '500px' }}>
              <List
                dataSource={Array.from(receivedFiles.values())}
                renderItem={(file) => (
                  <List.Item>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tooltip title={file.name}>
                          <div
                            style={{
                              flex: 1,
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {file.name}
                          </div>
                        </Tooltip>
                        <div style={{ flex: 2 }}>
                          <Progress
                            percent={Math.round((file.receivedSize / file.size) * 100)}
                            size="small"
                            showInfo={true}
                          />
                        </div>
                        <Button
                          icon={<DownloadOutlined />}
                          size="small"
                          onClick={() => {
                            const blob = new Blob(file.chunks, { type: file.type });
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = file.name;
                            link.click();
                          }}
                          disabled={file.receivedSize < file.size}
                        />
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </div>
      </div>
    </Content>
  )
}