import { Injectable, OnDestroy, signal } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { environment } from '../../enviroments/environment';

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  total: number;
  creado: Date | null;
}

export class CodigoDuplicadoError extends Error {
  constructor() {
    super('Ya existe un producto con este código en el inventario.');
  }
}

export function filtrarProductos(productos: readonly Producto[], busqueda: string): Producto[] {
  const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termino = normalizar(busqueda.trim());
  return productos.filter(producto =>
    normalizar(producto.codigo).includes(termino) || normalizar(producto.nombre).includes(termino),
  );
}

@Injectable({ providedIn: 'root' })
export class ProductosService implements OnDestroy {
  private readonly app = getApps().length ? getApp() : initializeApp(environment.firebase);
  private readonly auth = getAuth(this.app);
  private readonly firestore = getFirestore(this.app);
  readonly productos = signal<Producto[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  private detenerProductos?: () => void;
  private readonly detenerAuth = onAuthStateChanged(this.auth, usuario => {
    this.detenerProductos?.();
    this.productos.set([]);
    this.error.set('');
    if (usuario) {
      this.cargar();
    } else {
      this.cargando.set(false);
      this.error.set('Inicia sesión para consultar el inventario.');
    }
  });

  cargar(): void {
    if (!this.auth.currentUser) return;
    this.detenerProductos?.();
    this.cargando.set(true);
    this.error.set('');
    this.detenerProductos = onSnapshot(
      query(collection(this.firestore, 'productos'), orderBy('creado', 'desc')),
      snapshot => {
        this.productos.set(snapshot.docs.map(documento => {
          const datos = documento.data();
          return {
            id: documento.id,
            codigo: typeof datos['codigo'] === 'string' ? datos['codigo'] : '',
            nombre: typeof datos['nombre'] === 'string' ? datos['nombre'] : '',
            total: typeof datos['total'] === 'number' && Number.isInteger(datos['total']) && datos['total'] >= 0
              ? datos['total'] : 0,
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

  async agregar(codigo: string, nombre: string, total: number): Promise<void> {
    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('Inicia sesión para agregar productos.');
    const datos = this.validarDatos(codigo, nombre, total);

    // El prefijo y la codificación permiten códigos con barras, puntos y otros símbolos.
    // Un ID determinista evita duplicados incluso si dos equipos registran el mismo QR.
    const referencia = doc(this.firestore, 'productos', await this.idParaCodigo(datos.codigo));
    await runTransaction(this.firestore, async transaccion => {
      if ((await transaccion.get(referencia)).exists()) throw new CodigoDuplicadoError();
      transaccion.set(referencia, {
        ...datos,
        creado: serverTimestamp(),
        creadoPor: usuario.uid,
      });
    });
  }

  async actualizar(productoId: string, codigo: string, nombre: string, total: number): Promise<void> {
    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('Inicia sesión para editar productos.');
    const datos = this.validarDatos(codigo, nombre, total);
    const referenciaActual = doc(this.firestore, 'productos', productoId);
    const referenciaNueva = doc(this.firestore, 'productos', await this.idParaCodigo(datos.codigo));

    await runTransaction(this.firestore, async transaccion => {
      const actual = await transaccion.get(referenciaActual);
      if (!actual.exists()) throw new Error('El producto ya no existe.');
      if (referenciaActual.id === referenciaNueva.id) {
        transaccion.update(referenciaActual, { ...datos, actualizado: serverTimestamp(), actualizadoPor: usuario.uid });
        return;
      }
      if ((await transaccion.get(referenciaNueva)).exists()) throw new CodigoDuplicadoError();
      transaccion.set(referenciaNueva, {
        ...actual.data(), ...datos, actualizado: serverTimestamp(), actualizadoPor: usuario.uid,
      });
      transaccion.delete(referenciaActual);
    });
  }

  async eliminar(productoId: string): Promise<void> {
    if (!this.auth.currentUser) throw new Error('Inicia sesión para eliminar productos.');
    await deleteDoc(doc(this.firestore, 'productos', productoId));
  }

  private validarDatos(codigo: string, nombre: string, total: number): Pick<Producto, 'codigo' | 'nombre' | 'total'> {
    const nombreLimpio = nombre.trim();
    if (!codigo.trim() || codigo.length > 4096) throw new Error('El código debe contener entre 1 y 4096 caracteres.');
    if (nombreLimpio.length > 120) throw new Error('El nombre puede tener hasta 120 caracteres.');
    if (!Number.isInteger(total) || total < 0 || total > 999999) {
      throw new Error('El total del producto debe ser un número entero entre 0 y 999999.');
    }
    return { codigo, nombre: nombreLimpio, total };
  }

  private async idParaCodigo(codigo: string): Promise<string> {
    const codigoCodificado = encodeURIComponent(codigo);
    if (codigoCodificado.length <= 1000) return `codigo_${codigoCodificado}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codigo));
    return `codigo_sha256_${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  mensajeError(error: unknown): string {
    const codigo = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    if (codigo === 'permission-denied') {
      return 'No tienes permiso para acceder a los productos. Revisa las reglas de la colección productos en Firestore.';
    }
    if (codigo === 'unavailable' || codigo === 'deadline-exceeded') {
      return 'No se pudo conectar con el inventario. Revisa tu conexión e inténtalo nuevamente.';
    }
    if (error instanceof CodigoDuplicadoError || (error instanceof Error && !codigo)) return error.message;
    return 'No se pudo completar la operación. Inténtalo nuevamente.';
  }

  ngOnDestroy(): void {
    this.detenerProductos?.();
    this.detenerAuth();
  }
}
