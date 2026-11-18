import { Injectable, OnDestroy, signal } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';
import { environment } from '../../enviroments/environment';
import { EstadoOrden, OrdenTrabajo, ServicioOrden } from '../taller/taller.models';

const ESTADOS: EstadoOrden[] = ['pendiente', 'proceso', 'listo', 'pagado'];

@Injectable({ providedIn: 'root' })
export class OrdenesService implements OnDestroy {
  private readonly app = getApps().length ? getApp() : initializeApp(environment.firebase);
  private readonly auth = getAuth(this.app);
  private readonly firestore = getFirestore(this.app);
  readonly ordenes = signal<OrdenTrabajo[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  private detenerOrdenes?: () => void;
  private readonly detenerAuth = onAuthStateChanged(this.auth, usuario => {
    this.detenerOrdenes?.();
    this.ordenes.set([]);
    this.error.set('');
    if (usuario) {
      this.cargar();
    } else {
      this.cargando.set(false);
      this.error.set('Inicia sesión para consultar las órdenes.');
    }
  });

  cargar(): void {
    if (!this.auth.currentUser) return;
    this.detenerOrdenes?.();
    this.cargando.set(true);
    this.error.set('');
    this.detenerOrdenes = onSnapshot(
      query(collection(this.firestore, 'ordenes'), orderBy('fecha', 'desc')),
      snapshot => {
        this.ordenes.set(snapshot.docs.map(documento => this.desdeFirestore(documento.id, documento.data())));
        this.cargando.set(false);
      },
      error => {
        this.error.set(this.mensajeError(error));
        this.cargando.set(false);
      },
    );
  }

  async guardar(orden: OrdenTrabajo, editando: boolean): Promise<void> {
    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('Inicia sesión para guardar órdenes.');
    const referencia = doc(this.firestore, 'ordenes', orden.id);
    const datos = this.paraFirestore(orden);

    if (editando) {
      await updateDoc(referencia, {
        ...datos,
        actualizado: serverTimestamp(),
        actualizadoPor: usuario.uid,
      });
      return;
    }

    await setDoc(referencia, {
      ...datos,
      creado: serverTimestamp(),
      creadoPor: usuario.uid,
    });
  }

  async actualizar(orden: OrdenTrabajo): Promise<void> {
    await this.guardar(orden, true);
  }

  mensajeError(error: unknown): string {
    const codigo = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    if (codigo === 'permission-denied') {
      return 'No tienes permiso para acceder a las órdenes. Revisa las reglas de Firestore.';
    }
    if (codigo === 'unavailable' || codigo === 'deadline-exceeded') {
      return 'No se pudo conectar con las órdenes. Revisa tu conexión e inténtalo nuevamente.';
    }
    if (error instanceof Error && !codigo) return error.message;
    return 'No se pudo completar la operación con la orden. Inténtalo nuevamente.';
  }

  ngOnDestroy(): void {
    this.detenerOrdenes?.();
    this.detenerAuth();
  }

  private paraFirestore(orden: OrdenTrabajo): Omit<OrdenTrabajo, 'id' | 'fecha'> & { fecha: Timestamp } {
    const fecha = new Date(orden.fecha);
    if (Number.isNaN(fecha.getTime())) throw new Error('La fecha de la orden no es válida.');
    return {
      folio: orden.folio,
      cliente: orden.cliente,
      telefono: orden.telefono?.trim() ?? '',
      moto: orden.moto,
      estado: orden.estado,
      observaciones: orden.observaciones,
      servicios: orden.servicios,
      manoObra: orden.manoObra,
      fecha: Timestamp.fromDate(fecha),
    };
  }

  private desdeFirestore(id: string, datos: Record<string, unknown>): OrdenTrabajo {
    const fecha = datos['fecha'];
    const servicios = Array.isArray(datos['servicios'])
      ? datos['servicios'].map(servicio => this.servicioValido(servicio)).filter((servicio): servicio is ServicioOrden => !!servicio)
      : [];
    return {
      id,
      folio: typeof datos['folio'] === 'string' ? datos['folio'] : '',
      cliente: typeof datos['cliente'] === 'string' ? datos['cliente'] : '',
      telefono: typeof datos['telefono'] === 'string' ? datos['telefono'] : '',
      moto: typeof datos['moto'] === 'string' ? datos['moto'] : '',
      estado: ESTADOS.includes(datos['estado'] as EstadoOrden) ? datos['estado'] as EstadoOrden : 'pendiente',
      observaciones: typeof datos['observaciones'] === 'string' ? datos['observaciones'] : '',
      servicios,
      manoObra: typeof datos['manoObra'] === 'number' && datos['manoObra'] >= 0 ? datos['manoObra'] : 0,
      fecha: fecha instanceof Timestamp ? fecha.toDate().toISOString() : new Date(0).toISOString(),
    };
  }

  private servicioValido(valor: unknown): ServicioOrden | null {
    if (typeof valor !== 'object' || valor === null) return null;
    const servicio = valor as Record<string, unknown>;
    if (typeof servicio['id'] !== 'string' || typeof servicio['nombre'] !== 'string') return null;
    return {
      id: servicio['id'],
      nombre: servicio['nombre'],
      precio: typeof servicio['precio'] === 'number' && servicio['precio'] >= 0 ? servicio['precio'] : 0,
    };
  }
}
