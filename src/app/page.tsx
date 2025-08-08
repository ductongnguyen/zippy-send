'use client'
import { Button, Card, Input, Layout, List, message, Progress, Space, Tooltip, Typography, Upload } from 'antd'
import { DeleteOutlined, DownloadOutlined, FileOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd'
import type { RcFile } from 'antd/es/upload/interface'
import { useState, useRef, useEffect } from 'react'
import Dragger from 'antd/es/upload/Dragger'
import QRCodeStyling from 'qr-code-styling'
import Pusher from 'pusher-js' // Import Pusher
import JSZip from 'jszip';

const { Content } = Layout

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
}

interface ReceivingFile {
  name: string
  size: number
  type: string
  receivedSize: number
  chunks: BlobPart[]
}

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

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<any | null>(null);

  const cleanup = () => {
    console.error('%cCLEANUP FUNCTION CALLED!', 'color: red; font-size: 14px;'); // <-- THÊM DÒNG NÀY

    if (channelRef.current) {
      channelRef.current.unbind_all();
      pusherRef.current?.unsubscribe(channelRef.current.name);
      channelRef.current = null;
    }
    dataChannelRef.current?.close()
    peerConnectionRef.current?.close()
    dataChannelRef.current = null
    peerConnectionRef.current = null
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

  useEffect(() => {
    if (code && qrRef.current) {
      if (qrCode) qrCode.update({ data: code });
      else {
        const qr = new QRCodeStyling({
          width: 240, height: 240, type: 'canvas', data: code, image: '/logo.svg',
          dotsOptions: { color: '#000', type: 'rounded' },
          imageOptions: { crossOrigin: 'anonymous', margin: 4, imageSize: 0.3 },
        });
        qr.append(qrRef.current);
        setQrCode(qr);
      }
    }
  }, [code, qrCode])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isSending) {
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            resetSenderState()
            message.warning('No receiver connected. Session expired.')
            return 600
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isSending])

  const sendSignal = async (signalCode: string, eventName: string, data: any) => {
    await fetch('/api/pusher/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: signalCode, event: eventName, data }),
    })
  }

  const initializeSenderPeerConnection = async (senderCode: string) => {
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;
    console.log("PeerConnection đã được tạo (Sender).");

    const dataChannel = pc.createDataChannel('file-transfer');
    dataChannelRef.current = dataChannel;
    console.log("DataChannel đã được tạo ở Sender.");

    dataChannel.onopen = () => {
      message.success('Connection established! Sending files...');
      setCountdown(9999);
      sendFiles(dataChannel);
    };

    dataChannel.onclose = () => {
      console.log('File transfer completed or connection closed.');
      resetSenderState();
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
      console.log("Sender đã tạo offer và gửi.");
      sendSignal(senderCode, 'offer', offer);
    });

    channelRef.current?.bind('answer', async (data: any) => {
      console.log("Sender nhận được answer.");
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    });

    channelRef.current?.bind('ice-candidate', async (data: any) => {
      await pc.addIceCandidate(new RTCIceCandidate(data));
    });
  };

  const sendFiles = async (dc: RTCDataChannel) => {
    for (const file of fileList) {
      const fileData = file.originFileObj as File;
      const chunkSize = 16384; // 16KB
      dc.send(JSON.stringify({ name: fileData.name, size: fileData.size, type: fileData.type, }));
      const fileReader = new FileReader();
      let offset = 0;
      fileReader.onload = (e) => {
        if (e.target?.result) {
          dc.send(e.target.result as ArrayBuffer);
          offset += (e.target.result as ArrayBuffer).byteLength;
          if (offset < fileData.size) readSlice(offset);
        }
      };
      const readSlice = (o: number) => {
        const slice = fileData.slice(o, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
      };
      readSlice(0);
    }
  };

  const handleIncomingFile = (event: MessageEvent) => {
    const data = event.data;
    if (typeof data === 'string') {
      try {
        const fileMeta = JSON.parse(data);
        if (fileMeta && fileMeta.name && fileMeta.size) {
          setReceivedFiles((prev) => {
            const newMap = new Map(prev);
            newMap.set(fileMeta.name, {
              name: fileMeta.name,
              size: fileMeta.size,
              type: fileMeta.type || 'application/octet-stream',
              receivedSize: 0,
              chunks: [],
            });
            return newMap;
          });
          setIsReceiving(true);
        }
      } catch (e) {
        console.error("Failed to parse file metadata:", e);
      }
    } else if (data instanceof ArrayBuffer) {
      setReceivedFiles((prev) => {
        const newMap = new Map(prev);
        for (const [name, file] of newMap.entries()) {
          if (file.receivedSize < file.size) {
            file.chunks.push(data);
            file.receivedSize += data.byteLength;

            if (file.receivedSize >= file.size) {
              const blob = new Blob(file.chunks, { type: file.type });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = file.name;
              message.success(`Downloaded: ${file.name}`);
            }

            break;
          }
        }
        return newMap;
      });
    }
  };

  const resetReceiverState = () => {
    setIsReceiving(false);
    setReceiveCode('');
    setReceivedFiles(new Map());
    cleanup();
  };


  const initializeReceiverPeerConnection = async (receiverCode: string) => {
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;
    console.log("PeerConnection đã được tạo (Receiver).");

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      dataChannelRef.current = channel;
      console.log("Receiver đã nhận được DataChannel.");

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
      console.log("Receiver nhận được offer.");
      await pc.setRemoteDescription(new RTCSessionDescription(data));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal(receiverCode, 'answer', answer);
    });

    channelRef.current?.bind('ice-candidate', async (data: any) => {
      await pc.addIceCandidate(new RTCIceCandidate(data));
    });
  };

  const handleSend = () => {
    if (fileList.length === 0) {
      message.error('Please select at least one file to send.');
      return;
    }
    setIsSending(true);
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
  
  const resetSenderState = () => {
    setIsSending(false);
    setFileList([]);
    setCode('');
    cleanup();
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
          {fileList.length === 0 ? (
            <Dragger {...props} style={{ width: '100%', color: '#E53935' }}>
              <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#E53935' }} /></p>
              <p className="ant-upload-text">Click or drag file to this area to upload</p>
              <p className="ant-upload-hint">You can upload one or multiple files at once.</p>
            </Dragger>
          ) : (
            <Card title="Uploaded Files" style={{ width: '100%' }} hidden={isSending}
              extra={<Upload multiple showUploadList={false} beforeUpload={() => false}
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
          )}

          {isSending && fileList.length > 0 && (
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
              <Typography.Text strong style={{ textAlign: 'center', marginTop: 12 }}>Scan QR to receive files:</Typography.Text>
              <div ref={qrRef} style={{ marginTop: 12 }} />
            </div>
          )}
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
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

          {isReceiving && receivedFiles.size > 0 && (
            <Card title="Downloading..." extra={
              <Button icon={<DownloadOutlined />} onClick={handleDownloadAllZip}>
                Download All
              </Button>
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
                            showInfo={false}
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