// =====================================================================================
// Pantalla de Mecánicos
// -------------------------------------------------------------------------------------
// Muestra la tabla de mecánicos, las alertas de pago y el formulario para agregar/editar.
// Los datos y el guardado en Firestore los maneja MecanicosService (mecanicos.service.ts).
// =====================================================================================
import { CurrencyPipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import {
  CELULAR, esEspecialidadValida, esFechaValida, esNombreValido, filtrarMecanicos, formatearEspecialidad,
  formatearNombre, Mecanico, MecanicosService, soloDigitosCelular, soloLetras, soloLetrasYComas,
  tieneMaximoDosDecimales,
} from './mecanicos.service';

// -------------------------------------------------------------------------------------
// Funciones de formato para mostrar datos en la tabla
// -------------------------------------------------------------------------------------

/** Muestra el celular como "987 654 321" (o "—" si no tiene). */
export function formatearCelular(celular: string): string {
  return CELULAR.test(celular) ? celular.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : '—';
}

/** Fecha local de hoy en formato AAAA-MM-DD (el formato que usa <input type="date">). */
export function hoy(): string {
  const fecha = new Date();
  return [fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate()]
    .map((parte, i) => String(parte).padStart(i ? 2 : 4, '0')).join('-');
}

/** Convierte AAAA-MM-DD en DD/MM/AAAA sin pasar por Date, para evitar desfases de zona horaria. */
export function formatearFecha(fecha: string): string {
  if (!esFechaValida(fecha)) return '—';
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

// -------------------------------------------------------------------------------------
// Validadores del formulario
// Cada uno devuelve null si el campo está bien, o un objeto con el nombre del error.
// -------------------------------------------------------------------------------------

/** Nombre y apellido con solo letras. */
function nombreValido(control: AbstractControl): ValidationErrors | null {
  return esNombreValido(String(control.value ?? '')) ? null : { nombre: true };
}

/** Celular de 9 dígitos que empieza con 9. */
function celularValido(control: AbstractControl): ValidationErrors | null {
  return CELULAR.test(String(control.value ?? '')) ? null : { celular: true };
}

/** Especialidad con letras, espacios y comas. */
function especialidadValida(control: AbstractControl): ValidationErrors | null {
  return esEspecialidadValida(String(control.value ?? '')) ? null : { especialidad: true };
}

/** Fecha que existe en el calendario. */
function fechaValida(control: AbstractControl): ValidationErrors | null {
  return esFechaValida(String(control.value ?? '')) ? null : { fecha: true };
}

/** La fecha de ingreso no puede ser una fecha futura. */
function ingresoNoFuturo(control: AbstractControl): ValidationErrors | null {
  const fecha = String(control.value ?? '');
  return esFechaValida(fecha) && fecha > hoy() ? { futuro: true } : null;
}

/** Monto con máximo 2 decimales (céntimos). */
function dosDecimales(control: AbstractControl): ValidationErrors | null {
  const monto = Number(control.value);
  return Number.isFinite(monto) && !tieneMaximoDosDecimales(monto) ? { decimales: true } : null;
}

/** Valida el formulario completo: la fecha de pago no puede ser antes del ingreso. */
function pagoDespuesDeIngreso(grupo: AbstractControl): ValidationErrors | null {
  const ingreso = String(grupo.get('fechaIngreso')?.value ?? '');
  const pago = String(grupo.get('fechaPago')?.value ?? '');
  return esFechaValida(ingreso) && esFechaValida(pago) && pago < ingreso ? { pagoAntesDeIngreso: true } : null;
}

@Component({
  selector: 'app-mecanicos',
  imports: [CurrencyPipe, ReactiveFormsModule],
  templateUrl: './mecanicos.html',
  styleUrl: './mecanicos.css',
})
export class Mecanicos implements OnDestroy {
  /** La ventana emergente (<dialog>) del formulario. */
  @ViewChild('dialogo', { static: true }) private dialogo!: ElementRef<HTMLDialogElement>;
  protected readonly servicio = inject(MecanicosService);

  // -----------------------------------------------------------------------------------
  // Búsqueda y conteos
  // "computed" se recalcula solo cuando cambian los datos de los que depende.
  // -----------------------------------------------------------------------------------
  protected readonly busqueda = signal('');
  protected readonly resultados = computed(() => filtrarMecanicos(this.servicio.mecanicos(), this.busqueda()));
  protected readonly activos = computed(() => this.servicio.mecanicos().filter(mecanico => mecanico.activo).length);

  // -----------------------------------------------------------------------------------
  // Paginación (igual que en Órdenes): 5 mecánicos por página con flechas ‹ ›
  // -----------------------------------------------------------------------------------
  protected readonly porPagina = 5;
  protected readonly pagina = signal(1);
  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.resultados().length / this.porPagina)));
  /** Evita quedar en una página que ya no existe (por ejemplo, después de buscar). */
  protected readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  /** Los mecánicos que se ven en la página actual. */
  protected readonly visibles = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.resultados().slice(inicio, inicio + this.porPagina);
  });
  /** Números para el texto "Mostrando 1–5 de 12 mecánicos". */
  protected readonly primerResultado = computed(() =>
    this.resultados().length ? (this.paginaActual() - 1) * this.porPagina + 1 : 0);
  protected readonly ultimoResultado = computed(() =>
    Math.min(this.paginaActual() * this.porPagina, this.resultados().length));

  // -----------------------------------------------------------------------------------
  // Alertas de pago
  // -----------------------------------------------------------------------------------
  protected readonly fechaHoy = hoy();
  /** Mecánicos activos cuya fecha de pago ya llegó, del más atrasado al más reciente. */
  protected readonly pagosPendientes = computed(() => this.servicio.mecanicos()
    .filter(mecanico => mecanico.activo && esFechaValida(mecanico.fechaPago) && mecanico.fechaPago <= this.fechaHoy)
    .sort((a, b) => a.fechaPago.localeCompare(b.fechaPago)));

  // -----------------------------------------------------------------------------------
  // Estado de la pantalla
  // -----------------------------------------------------------------------------------
  protected readonly pagando = signal('');          // ID del mecánico cuyo pago se está guardando
  protected readonly cambiandoEstado = signal('');  // ID del mecánico que se está activando/desactivando
  protected readonly guardando = signal(false);     // true mientras se guarda el formulario
  protected readonly errorAccion = signal('');      // Error de pagos o estado (recuadro rojo arriba)
  protected readonly error = signal('');            // Error dentro del formulario
  protected readonly aviso = signal('');            // Mensaje verde flotante sobre la tabla
  protected readonly editando = signal<Mecanico | null>(null); // null = agregando uno nuevo
  protected readonly formatearFecha = formatearFecha;      // Para usarlas en el HTML
  protected readonly formatearCelular = formatearCelular;
  private temporizadorAviso?: number;

  ngOnDestroy(): void {
    if (this.temporizadorAviso !== undefined) window.clearTimeout(this.temporizadorAviso);
  }

  /** Muestra el aviso verde flotante sobre la tabla y lo oculta a los 3 segundos. */
  private mostrarAviso(mensaje: string): void {
    if (this.temporizadorAviso !== undefined) window.clearTimeout(this.temporizadorAviso);
    this.aviso.set(mensaje);
    this.temporizadorAviso = window.setTimeout(() => {
      this.aviso.set('');
      this.temporizadorAviso = undefined;
    }, 3000);
  }

  // -----------------------------------------------------------------------------------
  // Formulario: campos y sus validaciones
  // -----------------------------------------------------------------------------------
  protected readonly form = new FormBuilder().nonNullable.group({
    nombre: ['', [Validators.required, nombreValido]],
    celular: ['', [Validators.required, celularValido]],
    especialidad: ['', [Validators.required, especialidadValida]],
    fechaIngreso: [hoy(), [Validators.required, fechaValida, ingresoNoFuturo]],
    montoPago: [0, [Validators.required, Validators.min(0.01), Validators.max(999999.99), dosDecimales]],
    fechaPago: [hoy(), [Validators.required, fechaValida]],
  }, { validators: pagoDespuesDeIngreso });

  /** true si el campo ya fue tocado y tiene un error (para pintarlo de rojo y mostrar el mensaje). */
  protected invalido(campo: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[campo];
    return control.touched && control.invalid;
  }

  // -----------------------------------------------------------------------------------
  // Limpieza de los campos MIENTRAS se escribe
  // -----------------------------------------------------------------------------------

  /** Celular: solo deja escribir números, hasta 9. */
  protected filtrarCelular(input: HTMLInputElement): void {
    this.form.controls.celular.setValue(soloDigitosCelular(input.value));
  }

  /** Nombre: borra números y símbolos apenas se escriben. */
  protected filtrarNombre(input: HTMLInputElement): void {
    this.form.controls.nombre.setValue(soloLetras(input.value));
  }

  /** Especialidad: solo letras, espacios y comas. */
  protected filtrarEspecialidad(input: HTMLInputElement): void {
    this.form.controls.especialidad.setValue(soloLetrasYComas(input.value));
  }

  /** Al salir del campo nombre, lo ordena: "juan perez" → "Juan Perez". */
  protected ordenarNombre(): void {
    this.form.controls.nombre.setValue(formatearNombre(this.form.controls.nombre.value));
  }

  /** Al salir del campo especialidad, pone la primera letra en mayúscula. */
  protected ordenarEspecialidad(): void {
    this.form.controls.especialidad.setValue(formatearEspecialidad(this.form.controls.especialidad.value));
  }

  /** En el monto, bloquea las teclas "e", "+" y "-" que los campos numéricos aceptan por defecto. */
  protected bloquearTeclasMonto(evento: KeyboardEvent): void {
    if (['e', 'E', '+', '-'].includes(evento.key)) evento.preventDefault();
  }

  // -----------------------------------------------------------------------------------
  // Abrir y cerrar el formulario
  // -----------------------------------------------------------------------------------

  /** Abre el formulario vacío para agregar un mecánico nuevo. */
  protected abrir(): void {
    this.form.reset({ nombre: '', celular: '', especialidad: '', fechaIngreso: hoy(), montoPago: 0, fechaPago: hoy() });
    this.editando.set(null);
    this.error.set('');
    this.aviso.set('');
    this.dialogo.nativeElement.showModal();
  }

  /** Abre el formulario con los datos del mecánico para editarlos. */
  protected editar(mecanico: Mecanico): void {
    this.form.reset({
      nombre: mecanico.nombre,
      celular: mecanico.celular,
      especialidad: mecanico.especialidad,
      fechaIngreso: mecanico.fechaIngreso,
      montoPago: mecanico.montoPago,
      fechaPago: mecanico.fechaPago,
    });
    this.editando.set(mecanico);
    this.error.set('');
    this.aviso.set('');
    this.dialogo.nativeElement.showModal();
  }

  /** Cierra el formulario (no deja cerrarlo mientras se está guardando). */
  protected cerrar(event?: Event): void {
    event?.preventDefault();
    if (this.guardando()) return;
    this.dialogo.nativeElement.close();
    this.editando.set(null);
  }

  // -----------------------------------------------------------------------------------
  // Acciones de la tabla
  // -----------------------------------------------------------------------------------

  /** Cambia el texto de búsqueda y vuelve a la página 1. */
  protected buscar(texto: string): void {
    this.busqueda.set(texto);
    this.pagina.set(1);
  }

  /** Texto para la alerta: "Hoy" o "Atrasado N días". */
  protected atraso(fechaPago: string): string {
    const dias = Math.round((Date.parse(this.fechaHoy) - Date.parse(fechaPago)) / 86_400_000);
    return dias <= 0 ? 'Hoy' : `Atrasado ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }

  /** Botón "Registrar pago": la fecha de pago pasa al mes siguiente y la alerta desaparece. */
  protected async registrarPago(mecanico: Mecanico): Promise<void> {
    if (this.pagando()) return; // Evita doble clic
    this.pagando.set(mecanico.id);
    this.errorAccion.set('');
    try {
      const siguiente = await this.servicio.registrarPago(mecanico);
      this.mostrarAviso(`Pago de ${mecanico.nombre} registrado. Próximo pago: ${formatearFecha(siguiente)}.`);
    } catch (error) {
      this.errorAccion.set(this.servicio.mensajeError(error));
    } finally {
      this.pagando.set('');
    }
  }

  /** Interruptor de la columna ESTADO: activa o desactiva al mecánico. */
  protected async cambiarEstado(mecanico: Mecanico): Promise<void> {
    if (this.cambiandoEstado()) return; // Evita doble clic
    const activo = !mecanico.activo;
    this.cambiandoEstado.set(mecanico.id);
    this.errorAccion.set('');
    try {
      await this.servicio.cambiarEstado(mecanico.id, activo);
      this.mostrarAviso(`Mecánico ${mecanico.nombre} ${activo ? 'activado' : 'desactivado'}.`);
    } catch (error) {
      this.errorAccion.set(this.servicio.mensajeError(error));
    } finally {
      this.cambiandoEstado.set('');
    }
  }

  /** Botón "Guardar": valida, ordena el texto y guarda (nuevo o edición). */
  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    this.error.set('');
    // Ordena nombre y especialidad por si el usuario presionó Enter sin salir del campo.
    this.ordenarNombre();
    this.ordenarEspecialidad();
    // Marca todos los campos como tocados para que se vean los errores.
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const datos = this.form.getRawValue();
    const mecanicoEditado = this.editando();
    this.guardando.set(true);
    this.form.disable(); // Bloquea el formulario mientras se guarda
    try {
      if (mecanicoEditado) {
        await this.servicio.actualizar(mecanicoEditado.id, datos);
      } else {
        await this.servicio.agregar(datos);
      }
      this.guardando.set(false);
      this.cerrar();
      this.buscar('');
      this.mostrarAviso(`Mecánico ${datos.nombre} ${mecanicoEditado ? 'actualizado' : 'registrado'} correctamente.`);
    } catch (error) {
      this.error.set(this.servicio.mensajeError(error));
    } finally {
      this.guardando.set(false);
      this.form.enable();
    }
  }
}
