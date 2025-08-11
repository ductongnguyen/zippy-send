'use client'

import Link from 'next/link'
import { Layout, Button, Space } from 'antd'
import { GiftOutlined } from '@ant-design/icons'    
const { Header } = Layout

export default function PageHeader() {
    // const { user, isAuthenticated, loading: userLoading, logout } = useAuth()

    // const handleLogout = () => {
    //     logout()
    // }

    return (
        <Header
            style={{
                background: '#fff',
                padding: '12px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                minHeight: '64',
                transition: 'all 0.3s ease-in-out',
                zIndex: 1000, // fix overlap bugs
                position: 'sticky',
                top: 0,

            }}
        >
            <Link href="/">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src="/logo.svg" alt="Logo" className="h-28 max-w-full object-contain block" />
                    {/* <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Zippy Send</span> */}
                </div>
            </Link>

            <div style={{ marginLeft: 'auto' }}>
                <Space>
                        <Link href="https://buymeacoffee.com/kazima" target="_blank"><Button className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded"><GiftOutlined /> Buy me a coffee </Button></Link>
                    </Space>
                
            </div>
        </Header>

    )
}
