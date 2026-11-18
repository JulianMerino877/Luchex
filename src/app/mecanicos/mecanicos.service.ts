// =====================================================================================
// Servicio de Mecánicos
// -------------------------------------------------------------------------------------
// Se encarga de TODO lo que tiene que ver con los datos de los mecánicos:
//   - Leerlos de Firestore en tiempo real (colección "mecanicos").
//   - Agregar, editar, activar/desactivar y registrar pagos.
//   - Validar y ordenar los datos antes de guardarlos.
// El componente (mecanicos.ts) solo muestra la pantalla y llama a este servicio.
// =====================================================================================
import { Injectable, OnDestroy, signal } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  addDoc, collection, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc,
} from 'firebase/firestore';
import { environment } from '../../enviroments/environment';

/** Un mecánico tal como lo usa la aplicación. */
export interface Mecanico {
  id: string;            // ID del documento en Firestore
  nombre: string;        // Nombre y apellido, ej. "Juan Pérez"
  celular: string;       // 9 dígitos que empiezan con 9. Vacío en registros antiguos.
  especialidad: string;  // Ej. "Motor y frenos"
  fechaIngreso: string;  // Fecha en formato AAAA-MM-DD
  montoPago: number;     // Sueldo mensual en soles
  fechaPago: string;     // Próxima fecha de pago, formato AAAA-MM-DD
  activo: boolean;       // true = trabaja actualmente en el taller
  creado: Date | null;   // Cuándo se registró (null mientras Firestore confirma)
}

/** Los datos que llena el usuario en el formulario. */
export type DatosMecanico = Pick<Mecanico, 'nombre' | 'celular' | 'especialidad' | 'fechaIngreso' | 'montoPago' | 'fechaPago'>;

// -------------------------------------------------------------------------------------
// Expresiones regulares de validación
// -------------------------------------------------------------------------------------

/** Celular peruano: empieza con 9 y tiene exactamente 9 dígitos. */
export const CELULAR = /^9\d{8}$/;

/** Letras permitidas en nombres: incluye tildes, ü y ñ. */
const LETRA = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';

/** Nombre y apellido: al menos dos palabras de solo letras, separadas por un espacio. */
const NOMBRE_COMPLETO = new RegExp(`^[${LETRA}]{2,}( [${LETRA}]+)+$`);

/** Especialidad: letras, espacios y comas (ej. "Motor, frenos y luces"). */
const ESPECIALIDAD = new RegExp(`^[${LETRA}][${LETRA} ,]*$`);

/** Fecha con forma AAAA-MM-DD (luego se comprueba que exista en el calendario). */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Palabras que van en minúscula dentro de un nombre: "Juan de la Cruz". */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

// -------------------------------------------------------------------------------------
// Funciones para limpiar y ordenar texto
// -------------------------------------------------------------------------------------

/** Quita todo lo que no sea número y deja máximo 9 dígitos: "987-654 3210" → "987654321". */
export function soloDigitosCelular(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, 9);
}

/** Borra números y símbolos de un nombre mientras se escribe: "juan2 p@rez" → "juan prez". */
export function soloLetras(valor: string): string {
  return valor.replace(new RegExp(`[^${LETRA} ]`, 'g'), '');
}

/** Igual que soloLetras pero también permite comas (para la especialidad). */
export function soloLetrasYComas(valor: string): string {
  return valor.replace(new RegExp(`[^${LETRA} ,]`, 'g'), '');
}

/** Quita espacios al inicio y al final, y deja un solo espacio entre palabras. */
function limpiarEspacios(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

/**
 * Ordena un nombre aunque lo escriban en minúsculas o MAYÚSCULAS.
 * "  juan   PÉREZ de la cruz " → "Juan Pérez de la Cruz"
 */
export function formatearNombre(nombre: string): string {
  return limpiarEspacios(nombre)
    .toLocaleLowerCase('es-PE')
    .split(' ')
    .map((palabra, indice) =>
      // Las partículas (de, la, del…) quedan en minúscula, salvo si son la primera palabra.
      indice > 0 && PARTICULAS.has(palabra) ? palabra : palabra.charAt(0).toLocaleUpperCase('es-PE') + palabra.slice(1))
    .join(' ');
}

/** Primera letra en mayúscula y el resto en minúscula: "MOTOR Y FRENOS" → "Motor y frenos". */
export function formatearEspecialidad(especialidad: string): string {
  const limpio = limpiarEspacios(especialidad).toLocaleLowerCase('es-PE').replace(/\s*,\s*/g, ', ');
  return limpio.charAt(0).toLocaleUpperCase('es-PE') + limpio.slice(1);
}

// -------------------------------------------------------------------------------------
// Funciones de validación (las usan el formulario y el servicio)
// -------------------------------------------------------------------------------------

/** true si el texto tiene nombre y apellido válidos (después de limpiar espacios). */
export function esNombreValido(nombre: string): boolean {
  const limpio = limpiarEspacios(nombre);
  return limpio.length <= 120 && NOMBRE_COMPLETO.test(limpio);
}

/** true si la especialidad tiene solo letras, espacios y comas. */
export function esEspecialidadValida(especialidad: string): boolean {
  const limpio = limpiarEspacios(especialidad);
  return limpio.length >= 3 && limpio.length <= 100 && ESPECIALIDAD.test(limpio);
}

/** Comprueba que el texto sea una fecha real AAAA-MM-DD (rechaza, por ejemplo, 2026-02-30). */
export function esFechaValida(fecha: string): boolean {
  if (!FECHA.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  // Si la fecha no existe, Date la "corre" al mes siguiente y ya no coincide con lo escrito.
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  return anio >= 1900 && anio <= 2099
    && real.getUTCFullYear() === anio && real.getUTCMonth() === mes - 1 && real.getUTCDate() === dia;
}

/** true si el monto tiene como máximo 2 decimales (céntimos): 10.5 sí, 10.555 no. */
export function tieneMaximoDosDecimales(monto: number): boolean {
  return Math.abs(monto * 100 - Math.round(monto * 100)) < 1e-6;
}

// -------------------------------------------------------------------------------------
// Pagos y búsqueda
// -------------------------------------------------------------------------------------

/**
 * Fecha del siguiente pago mensual. Si el día no existe en el mes siguiente se usa el último día
 * (31/01 → 28/02 o 29/02).
 */
export function siguienteFechaPago(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const anioSiguiente = mes === 12 ? anio + 1 : anio;
  const mesSiguiente = mes === 12 ? 1 : mes + 1;
  // El día 0 del mes que sigue es el último día del mes que buscamos.
  const ultimoDia = new Date(Date.UTC(anioSiguiente, mesSiguiente, 0)).getUTCDate();
  return [anioSiguiente, mesSiguiente, Math.min(dia, ultimoDia)]
    .map((parte, i) => String(parte).padStart(i ? 2 : 4, '0')).join('-');
}

/** Filtra la lista por nombre, especialidad o celular. Ignora tildes y mayúsculas. */
export function filtrarMecanicos(mecanicos: readonly Mecanico[], busqueda: string): Mecanico[] {
  // "Pérez" → "perez" para que buscar "perez" encuentre "Pérez".
  const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const termino = normalizar(busqueda.trim());
  const digitos = busqueda.replace(/[\s-]/g, '');
  return mecanicos.filter(mecanico =>
    normalizar(mecanico.nombre).includes(termino) || normalizar(mecanico.especialidad).includes(termino)
    // Solo busca por celular si lo escrito son números ("912 345" también sirve).
    || (/^\d+$/.test(digitos) && mecanico.celular.includes(digitos)),
  );
}

// =====================================================================================
// Servicio (una sola instancia para toda la app)
// =====================================================================================
@Injectable({ providedIn: 'root' })
export class MecanicosService implements OnDestroy {
  // Conexión con Firebase (reutiliza la app si otro módulo ya la inició).
  private readonly app = getApps().length ? getApp() : initializeApp(environment.firebase);
  private readonly auth = getAuth(this.app);
  private readonly firestore = getFirestore(this.app);

  // Estado que lee la pantalla. Son "signals": cuando cambian, la vista se actualiza sola.
  readonly mecanicos = signal<Mecanico[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');

  /** Función para dejar de escuchar Firestore (se llama al cerrar sesión o salir). */
  private detenerMecanicos?: () => void;

  /** Cuando el usuario inicia o cierra sesión, empieza o deja de leer los mecánicos. */
  private readonly detenerAuth = onAuthStateChanged(this.auth, usuario => {
    this.detenerMecanicos?.();
    this.mecanicos.set([]);
    this.error.set('');
    if (usuario) {
      this.cargar();
    } else {
      this.cargando.set(false);
      this.error.set('Inicia sesión para consultar a los mecánicos.');
    }
  });

  /** Escucha la colección "mecanicos" en tiempo real, del más nuevo al más antiguo. */
  cargar(): void {
    if (!this.auth.currentUser) return;
    this.detenerMecanicos?.();
    this.cargando.set(true);
    this.error.set('');
    this.detenerMecanicos = onSnapshot(
      query(collection(this.firestore, 'mecanicos'), orderBy('creado', 'desc')),
      snapshot => {
        // Convierte cada documento de Firestore en un objeto Mecanico.
        this.mecanicos.set(snapshot.docs.map(documento => {
          const datos = documento.data();
          const texto = (campo: string) => typeof datos[campo] === 'string' ? datos[campo] as string : '';
          return {
            id: documento.id,
            // Se ordena al leer, así los registros antiguos escritos en minúsculas también se ven bien.
            nombre: formatearNombre(texto('nombre')),
            celular: texto('celular'),
            especialidad: formatearEspecialidad(texto('especialidad')),
            fechaIngreso: texto('fechaIngreso'),
            montoPago: typeof datos['montoPago'] === 'number' ? datos['montoPago'] : 0,
            fechaPago: texto('fechaPago'),
            // Los registros antiguos no tienen "activo": se consideran activos.
            activo: datos['activo'] !== false,
            creado: datos['creado'] instanceof Timestamp ? datos['creado'].toDate() : null,
          };
        }));
        this.cargando.set(false);
      },
      error => {
        this.error.set(this.mensajeError(error));
        this.cargando.set(false);
      },
    );
  }

  /** Crea un mecánico nuevo (siempre empieza activo). */
  async agregar(datos: DatosMecanico): Promise<void> {
    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('Inicia sesión para registrar mecánicos.');
    await addDoc(collection(this.firestore, 'mecanicos'), {
      ...this.validarDatos(datos),
      activo: true,
      creado: serverTimestamp(),   // Hora del servidor, no la de la PC
      creadoPor: usuario.uid,      // Quién lo registró
    });
  }

  /** Guarda los cambios hechos en el formulario de edición. */
  async actualizar(mecanicoId: string, datos: DatosMecanico): Promise<void> {
    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('Inicia sesión para editar mecánicos.');
    await updateDoc(doc(this.firestore, 'mecanicos', mecanicoId), {
      ...this.validarDatos(datos),
      actualizado: serverTimestamp(),
      actualizadoPor: usuario.uid,
    });
  }

  /** Activa o desactiva a un mecánico (el interruptor de la columna ESTADO). */
  async cambiarEstado(mecanicoId: string, activo: boolean): Promise<void> {
    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('Inicia sesión para cambiar el estado del mecánico.');
    await updateDoc(doc(this.firestore, 'mecanicos', mecanicoId), {
      activo,
      actualizado: serverTimestamp(),
      actualizadoPor: usuario.uid,
    });
  }

  /** Marca el pago del mes como hecho: la fecha de pago avanza un mes. Devuelve la nueva fecha. */
  async registrarPago(mecanico: Mecanico): Promise<string> {
    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('Inicia sesión para registrar pagos.');
    if (!esFechaValida(mecanico.fechaPago)) throw new Error('El mecánico no tiene una fecha de pago válida.');
    const fechaPago = siguienteFechaPago(mecanico.fechaPago);
    await updateDoc(doc(this.firestore, 'mecanicos', mecanico.id), {
      fechaPago,
      actualizado: serverTimestamp(),
      actualizadoPor: usuario.uid,
    });
    return fechaPago;
  }

  /**
   * Última revisión antes de guardar: ordena el texto y comprueba cada campo.
   * Usa las mismas reglas que firestore.rules para mostrar un mensaje claro en vez de un error de permisos.
   */
  validarDatos(datos: DatosMecanico): DatosMecanico {
    const nombre = formatearNombre(datos.nombre);
    const celular = soloDigitosCelular(datos.celular);
    const especialidad = formatearEspecialidad(datos.especialidad);
    const montoPago = Number(datos.montoPago);

    if (!esNombreValido(nombre)) throw new Error('Escribe nombre y apellido, solo con letras.');
    if (!CELULAR.test(celular)) throw new Error('El celular debe tener 9 dígitos y empezar con 9.');
    if (!esEspecialidadValida(especialidad)) throw new Error('La especialidad solo puede tener letras, espacios y comas.');
    if (!esFechaValida(datos.fechaIngreso)) throw new Error('Ingresa una fecha de ingreso válida.');
    if (!esFechaValida(datos.fechaPago)) throw new Error('Ingresa una fecha de pago válida.');
    if (datos.fechaPago < datos.fechaIngreso) {
      throw new Error('La fecha de pago no puede ser anterior a la fecha de ingreso.');
    }
    if (!Number.isFinite(montoPago) || montoPago <= 0 || montoPago > 999999.99 || !tieneMaximoDosDecimales(montoPago)) {
      throw new Error('El monto debe ser mayor a 0, hasta 999999.99 y con máximo 2 decimales.');
    }
    return { nombre, celular, especialidad, fechaIngreso: datos.fechaIngreso, montoPago, fechaPago: datos.fechaPago };
  }

  /** Convierte los errores técnicos de Firebase en mensajes que el usuario entienda. */
  mensajeError(error: unknown): string {
    const codigo = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    if (codigo === 'permission-denied') {
      return 'No tienes permiso para guardar o consultar mecánicos. Revisa las reglas de la colección mecanicos en Firestore.';
    }
    if (codigo === 'not-found') return 'El mecánico ya no existe.';
    if (codigo === 'unavailable' || codigo === 'deadline-exceeded') {
      return 'No se pudo conectar con el registro de mecánicos. Revisa tu conexión e inténtalo nuevamente.';
    }
    // Errores propios (los "throw new Error" de arriba) ya traen un mensaje en español.
    if (error instanceof Error && !codigo) return error.message;
    return 'No se pudo completar la operación. Inténtalo nuevamente.';
  }

  /** Limpieza: deja de escuchar Firestore y la sesión. */
  ngOnDestroy(): void {
    this.detenerMecanicos?.();
    this.detenerAuth();
  }
}
