import { Loader2 } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
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
import { useJurado } from '@/hooks/useJurado'
import { supabase } from '@/lib/supabase'
import type { JuradoSession } from '@/types/jurado'

const schema = z.object({
  codigo: z
    .string()
    .min(4, 'Código demasiado corto')
    .max(10, 'Código no válido')
    .transform((s) => s.trim().toUpperCase()),
  nombreCompleto: z.string().min(2, 'Ingresa tu nombre completo').max(200),
})

type FormValues = z.input<typeof schema>

export function JuradoLoginPage() {
  const navigate = useNavigate()
  const { session, setSession } = useJurado()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { codigo: '', nombreCompleto: '' },
  })

  useEffect(() => {
    if (session) {
      navigate('/jurado/panel', { replace: true })
    }
  }, [session, navigate])

  if (session) {
    return <Navigate to="/jurado/panel" replace />
  }

  async function onSubmit(values: FormValues) {
    const parsed = schema.parse(values)
    const { data: eventoRows, error: e1 } = await supabase.rpc(
      'buscar_evento_por_codigo',
      { p_codigo: parsed.codigo },
    )
    if (e1) {
      form.setError('root', { message: e1.message })
      return
    }
    const evento = eventoRows?.[0]
    if (!evento) {
      form.setError('root', {
        message: 'Código no válido o el evento no está abierto para jurados.',
      })
      return
    }

    const { data: juradoRows, error: e2 } = await supabase.rpc(
      'registrar_o_buscar_jurado',
      {
        p_evento_id: evento.id,
        p_nombre_completo: parsed.nombreCompleto.trim(),
      },
    )
    if (e2) {
      form.setError('root', { message: e2.message })
      return
    }
    const row = juradoRows?.[0]
    if (!row) {
      form.setError('root', { message: 'No se pudo registrar el jurado.' })
      return
    }

    const next: JuradoSession = {
      eventoId: evento.id,
      eventoNombre: evento.nombre,
      codigoAcceso: parsed.codigo,
      juradoId: row.jurado_id,
      nombreCompleto: row.nombre_completo,
      orden: row.orden,
      tokenSesion: row.token_sesion as string,
    }
    setSession(next)
    navigate('/jurado/panel', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Ingreso jurado</CardTitle>
          <CardDescription>
            Código del evento (6 caracteres) y tu nombre completo tal como figura en la lista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {form.formState.errors.root && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>No se pudo ingresar</AlertTitle>
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <FormField
                control={form.control}
                name="codigo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código del evento</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        className="font-mono uppercase tracking-wider"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nombreCompleto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre completo</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Validando…
                  </>
                ) : (
                  'Ingresar'
                )}
              </Button>
            </form>
          </Form>

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
