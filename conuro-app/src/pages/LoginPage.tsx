import { Loader2 } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ClipboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { AuthLoadingPlaceholder } from '@/components/layouts/AuthLoadingPlaceholder'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_EMAIL_KEY } from '@/lib/constants'
import { getRoleHome } from '@/lib/role-routes'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const emailSchema = z.object({
  email: z.string().email('Correo no válido'),
})

type EmailForm = z.infer<typeof emailSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const { user, perfil, perfilError, loading, signOut } = useAuth()
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [pendingEmail, setPendingEmail] = useState('')
  const [otp, setOtp] = useState<string[]>(() => Array(8).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(600)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  })

  useEffect(() => {
    const stored = sessionStorage.getItem(LOGIN_EMAIL_KEY)
    if (stored) {
      setPendingEmail(stored)
      setStep('otp')
    }
  }, [])

  useEffect(() => {
    if (step !== 'otp') return
    setOtpSecondsLeft(600)
    const t = window.setInterval(() => {
      setOtpSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => window.clearInterval(t)
  }, [step, pendingEmail])

  useEffect(() => {
    if (!loading && user && perfil) {
      navigate(getRoleHome(perfil.rol), { replace: true })
    }
  }, [loading, user, perfil, navigate])

  if (!loading && user && perfil) {
    return <Navigate to={getRoleHome(perfil.rol)} replace />
  }

  if (loading) {
    return <AuthLoadingPlaceholder label="Cargando sesión" />
  }

  if (user && !perfil && !perfilError) {
    return <AuthLoadingPlaceholder label="Cargando perfil" />
  }

  async function onSendEmail(data: EmailForm) {
    setError(null)
    setSending(true)
    try {
      const { error: e } = await supabase.auth.signInWithOtp({
        email: data.email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      })
      if (e) {
        setError(e.message)
        return
      }
      setPendingEmail(data.email.trim().toLowerCase())
      sessionStorage.setItem(LOGIN_EMAIL_KEY, data.email.trim().toLowerCase())
      setStep('otp')
      setOtp(Array(8).fill(''))
      requestAnimationFrame(() => inputRefs.current[0]?.focus())
    } finally {
      setSending(false)
    }
  }

  async function onVerifyOtp() {
    const token = otp.join('')
    if (token.length !== 8) {
      setError('Ingresa los 8 dígitos del código.')
      return
    }
    setError(null)
    setVerifying(true)
    try {
      const { error: e } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token,
        type: 'email',
      })
      if (e) {
        if (/expired|invalid/i.test(e.message)) {
          setError('Código inválido o expirado. Puedes reenviar uno nuevo.')
        } else {
          setError(e.message)
        }
        return
      }
      sessionStorage.removeItem(LOGIN_EMAIL_KEY)
    } finally {
      setVerifying(false)
    }
  }

  async function onResend() {
    if (!pendingEmail) return
    setError(null)
    setSending(true)
    try {
      const { error: e } = await supabase.auth.signInWithOtp({
        email: pendingEmail,
        options: { shouldCreateUser: false },
      })
      if (e) setError(e.message)
      else setOtpSecondsLeft(600)
    } finally {
      setSending(false)
    }
  }

  function onOtpChange(index: number, value: string) {
    const digits = [...value].filter((c) => c >= '0' && c <= '9')
    const digit = digits[digits.length - 1] ?? ''
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < 7) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function onOtpKeyDown(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function onOtpPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = [...e.clipboardData.getData('text')]
      .filter((c) => c >= '0' && c <= '9')
      .join('')
      .slice(0, 8)
    const next = [...otp]
    for (let i = 0; i < 8; i++) next[i] = text[i] ?? ''
    setOtp(next)
    const last = Math.min(text.length, 7)
    inputRefs.current[last]?.focus()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Acceso administración</CardTitle>
          <CardDescription>
            Ingresa con el correo institucional y el código OTP de 8 dígitos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user && perfilError && (
            <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTitle>Perfil no disponible</AlertTitle>
              <AlertDescription className="mt-2">
                {perfilError}
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 h-auto p-0 text-amber-900 dark:text-amber-100"
                  onClick={() => void signOut()}
                >
                  Cerrar sesión e intentar con otra cuenta
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'email' ? (
            <Form {...emailForm}>
              <form
                className="space-y-4"
                onSubmit={emailForm.handleSubmit(onSendEmail)}
                noValidate
              >
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo electrónico</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={sending}>
                  {sending ? (
                    <>
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      Enviando…
                    </>
                  ) : (
                    'Enviar código OTP'
                  )}
                </Button>
              </form>
            </Form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Código enviado a <span className="font-medium text-foreground">{pendingEmail}</span>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Tiempo aproximado:{' '}
                <span className="font-mono font-medium text-foreground">
                  {String(Math.floor(otpSecondsLeft / 60)).padStart(2, '0')}:
                  {String(otpSecondsLeft % 60).padStart(2, '0')}
                </span>
              </p>
              <div className="flex flex-wrap justify-center gap-1.5" onPaste={onOtpPaste}>
                {otp.map((d, i) => (
                  <Input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    aria-label={`Dígito ${i + 1}`}
                    aria-invalid={!!error && otp.join('').length < 8}
                    className={cn('h-11 w-9 text-center font-mono text-lg')}
                    onChange={(e) => onOtpChange(i, e.target.value)}
                    onKeyDown={(e) => onOtpKeyDown(i, e.key)}
                  />
                ))}
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={verifying}
                onClick={() => void onVerifyOtp()}
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Verificando…
                  </>
                ) : (
                  'Verificar e ingresar'
                )}
              </Button>
              <div className="flex flex-wrap gap-3 text-sm">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto gap-2 p-0"
                  disabled={sending}
                  onClick={() => void onResend()}
                >
                  {sending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
                  Reenviar código
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => {
                    sessionStorage.removeItem(LOGIN_EMAIL_KEY)
                    setStep('email')
                    setOtp(Array(8).fill(''))
                    setError(null)
                  }}
                >
                  Cambiar correo
                </Button>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to="/">Volver al inicio</Link>
            </Button>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
