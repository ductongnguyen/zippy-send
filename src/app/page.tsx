'use client'
import { Button, Card, Input, Layout, List, message, Space, Typography, Upload } from 'antd'
import { DeleteOutlined, DownloadOutlined, FileOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd'
import type { RcFile } from 'antd/es/upload/interface'
import { useState, useRef, useEffect } from 'react'
import Dragger from 'antd/es/upload/Dragger'
import QRCodeStyling from 'qr-code-styling'
import socket from "@/lib/socket"
const { Content } = Layout



export default function Home() {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const qrRef = useRef<HTMLDivElement>(null)
  const [qrCode, setQrCode] = useState<QRCodeStyling | null>(null)
  const [link, setLink] = useState<string>('')
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [countdown, setCountdown] = useState(600);

  useEffect(() => {
    if (link && qrRef.current) {
      const qr = new QRCodeStyling({
        width: 240,
        height: 240,
        type: 'canvas',
        data: link,
        image: '/logo.svg',
        dotsOptions: {
          color: '#000',
          type: 'rounded',
        },
        imageOptions: {
          crossOrigin: 'anonymous',
          margin: 4,
          imageSize: 0.3,
        },
      })
      qr.append(qrRef.current)
      setQrCode(qr)
    }
  }, [link])
  const props: UploadProps = {
    name: 'file',
    multiple: true,
    itemRender: (originNode, file, fileList, actions) => {
      return null
    },
    beforeUpload: () => false,
    onChange(info) {
      setFileList(info.fileList);
    },
    onDrop(e) {
      const droppedFiles = Array.from(e.dataTransfer.files);

      const newUploadFiles: UploadFile[] = droppedFiles.map((file) => {
        const rcFile: RcFile = Object.assign(file, {
          uid: file.name + '-' + file.lastModified,
          lastModifiedDate: new Date(file.lastModified),
        });

        return {
          uid: rcFile.uid,
          name: rcFile.name,
          status: 'done',
          originFileObj: rcFile,
        };
      });

      setFileList((prev) => [...prev, ...newUploadFiles]);
    },
    fileList,
  };

  const handleSendP2P = async () => {
    setIsSending(true)
    genQRcode()
  };

  const genQRcode = () => {
    const code = Math.random().toString(36).slice(-6).toUpperCase()
    setLink(code)
    if (qrRef.current) qrRef.current.innerHTML = '' // clear QR before rerender
  }

  const sendViaP2P = async (file: File): Promise<void> => {
    console.log('Sending via P2P:', file.name);
    await new Promise((r) => setTimeout(r, 1000)); // giả lập delay
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isSending) {
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setFileList([]);
            setLink('');
            setIsSending(false);
            message.warning('No receiver connected. Session expired.');
            return 600;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isSending]);

  // Format time mm:ss
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };



  return (
    <Content style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          marginTop: 80,
          gap: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center' }}>
            Welcome to Zippy Send!
          </h1>
          <h2 style={{ fontSize: '1rem', marginBottom: '16px', textAlign: 'center' }}>
            Just tap. Just send. Just Zippy.
          </h2>

          {fileList.length === 0 ? (
            <Dragger {...props} style={{ width: '100%', color: '#E53935' }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#E53935' }} />
              </p>
              <p className="ant-upload-text break-words hover:text-red-500">
                Click or drag file to this area to upload
              </p>
              <p className="ant-upload-hint break-words hover:text-red-500">
                You can upload one or multiple files at once. Please avoid uploading company data or any restricted files to
                ensure safety and compliance.
              </p>
            </Dragger>
          ) : (
            <Card
              title="Uploaded Files"
              style={{ width: '100%' }}
              hidden={isSending}
              extra={
                <Upload
                  multiple
                  showUploadList={false}
                  beforeUpload={() => false}
                  onChange={(info) => {
                    setFileList((prev) => {
                      const existingUids = new Set(prev.map(file => file.uid));
                      const uniqueNewFiles = info.fileList
                        .filter(file => !existingUids.has(file.uid))
                        .map(file => ({
                          uid: file.uid,
                          name: file.name,
                          originFileObj: file.originFileObj,
                        }));
                      return [...prev, ...uniqueNewFiles];
                    });
                  }}
                  disabled={isSending}
                >
                  <Button icon={<InboxOutlined />}>Add more</Button>
                </Upload>
              }
              actions={[
                <SendOutlined style={{ fontSize: '16px', color: '#E53935' }} key="send" onClick={handleSendP2P} />,
              ]}
            >
              <div style={{ maxHeight: '300px', overflowY: 'auto', width: '100%' }}>
                <List
                  bordered
                  dataSource={fileList}
                  renderItem={(file) => (
                    <List.Item
                      key={file.uid}
                      style={{ padding: '12px 16px' }}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileOutlined className="text-lg text-blue-500" />
                          <Typography.Text
                            ellipsis={{ tooltip: file.name }}
                            className="text-sm"
                            style={{ maxWidth: '100%' }}
                          >
                            {file.name}
                          </Typography.Text>
                        </div>
                        <Button
                          type="text"
                          icon={<DeleteOutlined />}
                          danger
                          onClick={() =>
                            setFileList((prev) => prev.filter((f) => f.uid !== file.uid))
                          }
                          disabled={isSending}
                        />
                      </div>
                    </List.Item>
                  )}
                />
              </div>
            </Card>

          )}
          {link && fileList.length > 0 && (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isSending && (
                <div className="text-sm text-gray-500 text-center mt-2">
                  <p>Enter the 6-digit key on the receiving device.</p>
                 Expires in <span className="font-mono text-red-500">{formatTime(countdown)}</span>
                </div>
              )}
              <Card
                className="cursor-pointer bg-gray-100 hover:bg-gray-200 rounded-xl px-4 py-3 flex justify-center gap-2 select-all"
                onClick={() => navigator.clipboard.writeText(link)}
              >
                {link.split("").map((char, idx) => (
                  <span key={idx} className="text-2xl font-semibold">
                    {char}
                  </span>
                ))}
              </Card>

              <Typography.Text strong style={{ textAlign: 'center' }}>
                Scan QR to receive files:
              </Typography.Text>
              <div ref={qrRef} style={{ marginTop: 12 }} />
            </div>
          )}
        </div>

        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Card
            title={
              <div className="text-xl font-semibold text-center text-gray-800">
                Receive Files
              </div>
            }
            style={{ width: '100%', maxWidth: '500px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="Enter code to download files..."
                  size="large"
                  style={{ fontSize: '16px' }}
                />
                <Button
                  type="primary"
                  size="large"
                  icon={<DownloadOutlined />}
                  style={{
                    background: '#E53935',
                    borderColor: '#E53935',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  Download
                </Button>
              </Space.Compact>
              <div style={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>
                Enter the code provided by the sender to download files
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Content>

  )
}