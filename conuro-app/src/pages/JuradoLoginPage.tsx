import { ChevronLeft, Loader2 } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
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
import { useJurado } from '@/hooks/useJurado'
import { ConuroMarketingCta } from '@/components/marketing/ConuroMarketingCta'
import { supabase } from '@/lib/supabase'
import type { JuradoSession } from '@/types/jurado'

const codigoSchema = z.object({
  codigo: z
    .string()
    .length(6, 'El código debe tener exactamente 6 caracteres')
    .transform((s) => s.trim().toUpperCase()),
})

const nombreSchema = z.object({
  nombreCompleto: z.string().min(2, 'Ingresa tu nombre completo').max(200),
})

type CodigoValues = z.input<typeof codigoSchema>
type NombreValues = z.input<typeof nombreSchema>

type EventoEncontrado = {
  id: string
  nombre: string
  logo_url?: string | null
}

export function JuradoLoginPage() {
  const navigate = useNavigate()
  const { session, setSession } = useJurado()
  const [step, setStep] = useState<'codigo' | 'nombre'>('codigo')
  const [eventoEncontrado, setEventoEncontrado] = useState<EventoEncontrado | null>(null)
  const [codigoUsado, setCodigoUsado] = useState('')

  const codigoForm = useForm<CodigoValues>({
    resolver: zodResolver(codigoSchema),
    defaultValues: { codigo: '' },
  })

  const nombreForm = useForm<NombreValues>({
    resolver: zodResolver(nombreSchema),
    defaultValues: { nombreCompleto: '' },
  })

  useEffect(() => {
    if (session) {
      navigate('/jurado/panel', { replace: true })
    }
  }, [session, navigate])

  if (session) {
    return <Navigate to="/jurado/panel" replace />
  }

  async function onSubmitCodigo(values: CodigoValues) {
    const parsed = codigoSchema.parse(values)
    const { data: eventoRows, error } = await supabase.rpc('buscar_evento_por_codigo', {
      p_codigo: parsed.codigo,
    })
    if (error) {
      codigoForm.setError('root', { message: error.message })
      return
    }
    const evento = eventoRows?.[0] as EventoEncontrado | undefined
    if (!evento) {
      codigoForm.setError('root', {
        message: 'Código no válido. Verifica que el código sea correcto y que el evento esté abierto para jurados.',
      })
      return
    }
    setEventoEncontrado(evento)
    setCodigoUsado(parsed.codigo)
    setStep('nombre')
  }

  async function onSubmitNombre(values: NombreValues) {
    if (!eventoEncontrado) return
    const { data: juradoRows, error } = await supabase.rpc('registrar_o_buscar_jurado', {
      p_evento_id: eventoEncontrado.id,
      p_nombre_completo: values.nombreCompleto.trim(),
    })
    if (error) {
      nombreForm.setError('root', { message: error.message })
      return
    }
    const row = juradoRows?.[0]
    if (!row) {
      nombreForm.setError('root', { message: 'No se pudo registrar el jurado. Contacta al organizador.' })
      return
    }
    const next: JuradoSession = {
      eventoId: eventoEncontrado.id,
      eventoNombre: eventoEncontrado.nombre,
      codigoAcceso: codigoUsado,
      juradoId: row.jurado_id,
      nombreCompleto: row.nombre_completo,
      orden: row.orden,
      tokenSesion: row.token_sesion as string,
      logoUrl: eventoEncontrado.logo_url ?? null,
    }
    setSession(next)
    navigate('/jurado/panel', { replace: true })
  }

  function volverAlCodigo() {
    setStep('codigo')
    setEventoEncontrado(null)
    nombreForm.reset()
    nombreForm.clearErrors()
  }

  return (
    <AuthGateLayout
      title="Ingreso jurado"
      description={
        step === 'codigo'
          ? 'Ingresa el código del evento (6 caracteres) para verificar tu acceso.'
          : 'Confirma tu nombre tal como figura en la lista oficial del concurso.'
      }
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Button variant="link" className="h-auto p-0 text-muted-foreground" asChild>
            <Link to="/">Volver al inicio</Link>
          </Button>
        </p>
      }
    >
      {/* Paso 1: Código del evento */}
      {step === 'codigo' && (
        <>
          {codigoForm.formState.errors.root && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>No se pudo verificar el código</AlertTitle>
              <AlertDescription>
                {codigoForm.formState.errors.root.message}
              </AlertDescription>
            </Alert>
          )}
          <Form {...codigoForm}>
            <form
              className="space-y-5"
              onSubmit={codigoForm.handleSubmit(onSubmitCodigo)}
              noValidate
            >
              <FormField
                control={codigoForm.control}
                name="codigo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código del evento</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        inputMode="text"
                        autoCapitalize="characters"
                        maxLength={6}
                        placeholder="XXXXXX"
                        className="h-11 rounded-lg font-mono text-base uppercase tracking-widest shadow-sm"
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase().replace(/\s/g, ''))
                        }
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      6 caracteres — letras y números
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="h-11 w-full rounded-lg text-base font-medium"
                disabled={codigoForm.formState.isSubmitting}
              >
                {codigoForm.formState.isSubmitting ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Buscando evento…
                  </>
                ) : (
                  'Verificar código'
                )}
              </Button>
            </form>
          </Form>
        </>
      )}

      {/* Paso 2: Nombre completo (tras verificar el evento) */}
      {step === 'nombre' && eventoEncontrado && (
        <>
          {/* Confirmación del evento encontrado */}
          <div className="mb-5 rounded-lg border border-border bg-muted/50 p-4">
            {eventoEncontrado.logo_url && (
              <img
                src={eventoEncontrado.logo_url}
                alt=""
                className="mb-2 h-8 max-w-[8rem] object-contain object-left"
                aria-hidden
              />
            )}
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Evento verificado
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground leading-snug">
              {eventoEncontrado.nombre}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-auto px-0 py-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={volverAlCodigo}
            >
              <ChevronLeft className="size-3" aria-hidden />
              Cambiar código
            </Button>
          </div>

          {nombreForm.formState.errors.root && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>No se pudo ingresar</AlertTitle>
              <AlertDescription>
                {nombreForm.formState.errors.root.message}
              </AlertDescription>
            </Alert>
          )}

          <Form {...nombreForm}>
            <form
              className="space-y-5"
              onSubmit={nombreForm.handleSubmit(onSubmitNombre)}
              noValidate
            >
              <FormField
                control={nombreForm.control}
                name="nombreCompleto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre completo</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="name"
                        autoFocus
                        className="h-11 rounded-lg text-base shadow-sm"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Tal como figura en la lista oficial del concurso
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="h-11 w-full rounded-lg text-base font-medium"
                disabled={nombreForm.formState.isSubmitting}
              >
                {nombreForm.formState.isSubmitting ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Ingresando…
                  </>
                ) : (
                  'Ingresar al concurso'
                )}
              </Button>
            </form>
          </Form>
        </>
      )}

      <div className="mt-8 border-t border-border/60 pt-6">
        <ConuroMarketingCta utmMedium="jurado_login" className="text-center text-sm" />
      </div>
    </AuthGateLayout>
  )
}
