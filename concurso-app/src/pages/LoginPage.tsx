import { Loader2 } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ClipboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { AuthGateLayout } from '@/components/layouts/AuthGateLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
    <AuthGateLayout
      title="Acceso administración"
      description={
        step === 'email'
          ? 'Correo institucional y código OTP de 8 dígitos enviado por correo.'
          : 'Introduce el código de 8 dígitos que enviamos a tu bandeja.'
      }
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Button variant="link" className="h-auto p-0 text-muted-foreground" asChild>
            <Link to="/">Volver al inicio</Link>
          </Button>
        </p>
      }
    >
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
            className="space-y-5"
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
                    <Input
                      type="email"
                      autoComplete="email"
                      className="h-11 rounded-lg text-base shadow-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-11 w-full rounded-lg text-base font-medium" disabled={sending}>
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
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Enviado a{' '}
            <span className="font-medium break-all text-foreground">{pendingEmail}</span>
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tiempo restante
            </span>
            <span
              className="rounded-md bg-muted/80 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-foreground ring-1 ring-border/60"
              aria-live="polite"
            >
              {String(Math.floor(otpSecondsLeft / 60)).padStart(2, '0')}:
              {String(otpSecondsLeft % 60).padStart(2, '0')}
            </span>
          </div>
          <div
            className="flex flex-wrap justify-center gap-2 sm:gap-2.5"
            onPaste={onOtpPaste}
          >
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
                aria-label={`Dígito ${i + 1} del código`}
                aria-invalid={!!error && otp.join('').length < 8}
                className={cn(
                  'h-12 w-10 rounded-lg border-2 border-input bg-background text-center font-mono text-xl tabular-nums shadow-sm transition-colors',
                  'focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
                )}
                onChange={(e) => onOtpChange(i, e.target.value)}
                onKeyDown={(e) => onOtpKeyDown(i, e.key)}
              />
            ))}
          </div>
          <Button
            type="button"
            className="h-11 w-full rounded-lg text-base font-medium"
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
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
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
    </AuthGateLayout>
  )
}
