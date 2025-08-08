'use client'

import Link from 'next/link'
import { Layout, Button, Space } from 'antd'
import UserDropdown from './userDropdown'

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
                        <Link href="/login"><Button className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded">Login</Button></Link>
                        <Link href="/register"><Button className="border border-red-600 text-red-600 hover:bg-red-600 hover:text-white px-4 py-2 rounded">Register</Button></Link>
                    </Space>
                
            </div>
        </Header>

    )
}
