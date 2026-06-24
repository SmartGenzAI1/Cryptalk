'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Users, Zap, Loader2, Shield, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useChatStore } from '@/stores/chat-store'
import { apiPost } from '@/lib/api'
import Image from 'next/image'

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)

  // Client-side validation
  const errors = {
    username: username.length > 0 && username.length < 3 ? 'At least 3 characters' : '',
    password: password.length > 0 && password.length < 4 ? 'At least 4 characters' : '',
    name: mode === 'register' && name.length > 0 && name.length < 1 ? 'Required' : '',
  }
  const canSubmit = username.length >= 3 && password.length >= 4 && (mode === 'login' || name.length >= 1)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login' ? { username, password } : { username, name, password }
      const data = await apiPost<{ user: any }>(endpoint, body)
      setCurrentUser(data.user)
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created! 🔐')
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-stretch bg-background">
      {/* Left: hero / branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Animated glow orbs */}
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-white/10 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-1/4 left-1/4 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl"
        />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center overflow-hidden ring-1 ring-white/20">
              <Image src="/logo-small.png" alt="Cryptalk" width={48} height={48} className="object-contain" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Cryptalk</span>
          </div>

          <div className="space-y-8 max-w-md">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-5xl font-bold leading-tight"
            >
              Secure messaging,<br />supercharged with AI.
            </motion.h1>
            <p className="text-lg text-white/85">
              A blazing-fast messenger with channels, groups, real-time presence,
              and a built-in AI assistant that drafts, summarizes, and translates.
            </p>
            <div className="grid grid-cols-1 gap-3">
              {[
                { icon: Shield, title: 'Encrypted & secure', desc: 'Your conversations stay private' },
                { icon: Zap, title: 'Real-time everything', desc: 'Messages, typing & presence over WebSockets' },
                { icon: Sparkles, title: 'AI built in', desc: 'Smart replies, summaries & translations' },
                { icon: Users, title: 'Groups & channels', desc: 'Broadcast to thousands or chat 1-on-1' },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-3 rounded-2xl bg-white/10 backdrop-blur p-4 border border-white/10"
                >
                  <f.icon className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-sm text-white/75">{f.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Lock className="h-3.5 w-3.5" />
            <span>End-to-end real-time · No data leaves your device</span>
          </div>
        </div>
      </div>

      {/* Right: auth form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="h-12 w-12 rounded-2xl overflow-hidden ring-1 ring-border shadow-md">
              <Image src="/logo-small.png" alt="Cryptalk" width={48} height={48} className="object-contain" />
            </div>
            <span className="text-2xl font-bold">Cryptalk</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-muted-foreground mt-2">
              {mode === 'login'
                ? 'Sign in to continue to Cryptalk.'
                : 'Join Cryptalk and start messaging in seconds.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  required
                  className="h-11"
                  maxLength={50}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                placeholder="your_username"
                required
                autoCapitalize="none"
                autoCorrect="off"
                className={`h-11 ${errors.username ? 'border-destructive' : ''}`}
                maxLength={30}
              />
              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={`h-11 pr-10 ${errors.password ? 'border-destructive' : ''}`}
                  maxLength={100}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-medium"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full h-11 text-base bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>

          <AnimatePresence>
            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground flex items-start gap-2"
              >
                <Shield className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                <span>Your password is hashed with scrypt before storage. We never see or store it in plain text.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
