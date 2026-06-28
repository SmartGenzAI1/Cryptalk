'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, Users, Loader2, Lock, Mail, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useChatStore } from '@/stores/chat-store'
import { apiPost } from '@/lib/api'
import Image from 'next/image'

type Step = 'login' | 'register' | 'onboard'

export function AuthScreen() {
  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState(() => process.env.NEXT_PUBLIC_TEST_EMAIL || '')
  const [password, setPassword] = useState(() => process.env.NEXT_PUBLIC_TEST_PASSWORD || '')
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const passwordValid = password.length >= 6
  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username)
  const nameValid = name.trim().length >= 1
  const canSubmit = step === 'onboard' ? (usernameValid && nameValid) : (emailValid && passwordValid)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    try {
      if (step === 'login') {
        const data = await apiPost<{ user: any }>('/api/auth/login', { email, password })
        if (!data.user.isOnboarded) {
          setStep('onboard')
          setLoading(false)
          return
        }
        setCurrentUser(data.user)
        toast.success('Welcome back!')
      } else if (step === 'register') {
        const data = await apiPost<{ user: any }>('/api/auth/register', { email, password })
        setStep('onboard')
        toast.success('Account created! Choose your username.')
      } else if (step === 'onboard') {
        const data = await apiPost<{ user: any }>('/api/auth/onboard', { username, name })
        setCurrentUser(data.user)
        toast.success('Welcome to Cryptalk!')
      }
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-stretch bg-background">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <motion.div animate={{ x: [0, 30, 0], y: [0, -20, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <motion.div animate={{ x: [0, -20, 0], y: [0, 30, 0] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} className="absolute bottom-1/4 left-1/4 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Cryptalk" width={56} height={56} className="object-contain drop-shadow-lg" style={{ height: 'auto' }} priority />
            <span className="text-2xl font-bold tracking-tight">Cryptalk</span>
          </div>

          <div className="space-y-8 max-w-md">
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-5xl font-bold leading-tight">
              Private by default.<br />Fast by design.
            </motion.h1>
            <p className="text-lg text-white/85">
              No phone number required. End-to-end encrypted everything. Your data stays yours.
            </p>
            <div className="grid grid-cols-1 gap-3">
              {[
                { icon: Shield, title: 'Zero-knowledge server', desc: 'We can\'t read your messages' },
                { icon: Zap, title: 'Instant delivery', desc: 'Real-time WebSocket sync' },
                { icon: Users, title: 'Expiring groups', desc: 'Perfect for events & temp chats' },
              ].map((f, i) => (
                <motion.div key={f.title} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }} className="flex items-start gap-3 rounded-2xl bg-white/10 backdrop-blur p-4 border border-white/10">
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
            <span>Email-based · No phone · No tracking</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <Image src="/logo.png" alt="Cryptalk" width={96} height={96} className="object-contain drop-shadow-2xl mb-2" style={{ height: 'auto' }} priority />
            <span className="text-3xl font-bold tracking-tight">Cryptalk</span>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              {step !== 'onboard' && (
                <>
                  <div className={`h-1.5 w-8 rounded-full ${step === 'login' ? 'bg-primary' : 'bg-muted'}`} />
                  <div className={`h-1.5 w-8 rounded-full ${step === 'register' ? 'bg-primary' : 'bg-muted'}`} />
                </>
              )}
              {step === 'onboard' && (
                <div className="h-1.5 w-16 rounded-full bg-primary" />
              )}
            </div>
            <h2 className="text-3xl font-bold tracking-tight">
              {step === 'login' ? 'Welcome back' : step === 'register' ? 'Create account' : 'Choose your username'}
            </h2>
            <p className="text-muted-foreground mt-2">
              {step === 'login'
                ? 'Sign in with your email to continue.'
                : step === 'register'
                ? 'Email-based — no phone number required.'
                : 'Pick a username others can search for.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 'onboard' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                      placeholder="your_username"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      className={`pl-9 h-11 ${username && !usernameValid ? 'border-destructive' : ''}`}
                      maxLength={30}
                    />
                  </div>
                  {username && !usernameValid && <p className="text-xs text-destructive">3-30 chars: letters, numbers, underscores</p>}
                </div>
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
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      className={`pl-9 h-11 ${email && !emailValid ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {email && !emailValid && <p className="text-xs text-destructive">Enter a valid email</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className={`pl-9 pr-14 h-11 ${password && !passwordValid ? 'border-destructive' : ''}`}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-medium">
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {password && !passwordValid && <p className="text-xs text-destructive">At least 6 characters</p>}
                </div>
              </>
            )}

            <Button type="submit" disabled={loading || !canSubmit} className="w-full h-11 text-base bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {step === 'login' ? 'Sign in' : step === 'register' ? 'Create account' : 'Start chatting'}
            </Button>
          </form>

          {step !== 'onboard' && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {step === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={() => setStep(step === 'login' ? 'register' : 'login')} className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                {step === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
