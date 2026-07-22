import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Workspace from './components/Workspace.jsx'
import SetPassword from './components/SetPassword.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false }
  }
})

export default function App() {
  const isSetPassword = window.location.pathname === '/set-password' || new URLSearchParams(window.location.search).has('set-password')
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        {isSetPassword ? <SetPassword /> : <Workspace />}
      </div>
    </QueryClientProvider>
  )
}
