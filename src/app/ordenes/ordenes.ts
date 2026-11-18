import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TallerDataService } from '../taller/taller-data.service';
import { EstadoOrden, OrdenTrabajo, totalOrden, totalServicios } from '../taller/taller.models';

interface ColumnaOrden {
  estado: EstadoOrden;
  titulo: string;
  descripcion: string;
}

const NOMBRES_ESTADO: Record<EstadoOrden, string> = {
  pendiente: 'Pendiente',
  proceso: 'En proceso',
  listo: 'Listo',
  pagado: 'Pagado',
};
const SIGUIENTE_ESTADO: Partial<Record<EstadoOrden, EstadoOrden>> = {
  pendiente: 'proceso',
  proceso: 'listo',
  listo: 'pendiente',
};

@Component({
  selector: 'app-ordenes',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './ordenes.html',
  styleUrl: './ordenes.css',
})
export class Ordenes {
  @ViewChild('dialogo', { static: true }) private dialogo!: ElementRef<HTMLDialogElement>;
  private readonly data = inject(TallerDataService);
  private readonly router = inject(Router);

  protected readonly columnas: ColumnaOrden[] = [
    { estado: 'pendiente', titulo: 'Pendiente', descripcion: 'Por iniciar' },
    { estado: 'proceso', titulo: 'En proceso', descripcion: 'En el taller' },
    { estado: 'listo', titulo: 'Listo', descripcion: 'Para entregar' },
    { estado: 'pagado', titulo: 'Pagado', descripcion: 'Cobrado' },
  ];
  protected readonly nombresEstado = NOMBRES_ESTADO;
  protected readonly ordenes = this.data.ordenes;
  protected readonly cargandoOrdenes = this.data.cargandoOrdenes;
  protected readonly errorOrdenes = this.data.errorOrdenes;
  protected readonly busqueda = signal('');
  protected readonly estadoFiltro = signal<EstadoOrden | 'todas'>('todas');
  protected readonly ordenFecha = signal<'recientes' | 'antiguas'>('recientes');
  protected readonly pagina = signal(1);
  protected readonly porPagina = 5; // 5 por página, igual que Mecánicos
  protected readonly editando = signal(false);
  protected readonly exportandoExcel = signal(false);
  protected readonly guardando = signal(false);
  protected readonly intentoGuardar = signal(false);
  protected readonly aviso = signal('');        // Mensaje verde flotante sobre la tabla (3 s)
  protected readonly errorAccion = signal('');  // Error en rojo arriba de la tabla
  protected readonly borrador = signal<OrdenTrabajo>(this.nuevaOrden());
  protected readonly ordenesFiltradas = computed(() => {
    const termino = this.busqueda().trim().toLocaleLowerCase('es');
    if (!termino) return this.ordenes();
    return this.ordenes().filter((orden) =>
      [orden.moto, orden.cliente, orden.telefono ?? '', orden.folio, this.folioVisible(orden.folio),
        ...orden.servicios.map((servicio) => servicio.nombre)]
        .some((valor) => valor.toLocaleLowerCase('es').includes(termino)),
    );
  });
  protected readonly ordenesVisibles = computed(() => {
    const estado = this.estadoFiltro();
    const ordenes = this.ordenesFiltradas().filter((orden) => estado === 'todas' || orden.estado === estado);
    return ordenes.sort((a, b) => this.ordenFecha() === 'recientes'
      ? Date.parse(b.fecha) - Date.parse(a.fecha)
      : Date.parse(a.fecha) - Date.parse(b.fecha));
  });
  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.ordenesVisibles().length / this.porPagina)));
  protected readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  protected readonly ordenesPagina = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.ordenesVisibles().slice(inicio, inicio + this.porPagina);
  });
  protected readonly primerResultado = computed(() => this.ordenesVisibles().length ? (this.paginaActual() - 1) * this.porPagina + 1 : 0);
  protected readonly ultimoResultado = computed(() => Math.min(this.paginaActual() * this.porPagina, this.ordenesVisibles().length));

  protected buscarOrdenes(termino: string): void {
    this.busqueda.set(termino);
    this.pagina.set(1);
  }

  protected filtrarEstado(estado: EstadoOrden | 'todas'): void {
    this.estadoFiltro.set(estado);
    this.pagina.set(1);
  }

  protected ordenarPorFecha(orden: 'recientes' | 'antiguas'): void {
    this.ordenFecha.set(orden);
    this.pagina.set(1);
  }

  private temporizadorAviso?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizadorAviso));
  }

  protected abrirNueva(): void {
    this.borrador.set(this.nuevaOrden());
    this.editando.set(false);
    this.intentoGuardar.set(false);
    this.dialogo.nativeElement.showModal();
  }

  protected abrirEdicion(orden: OrdenTrabajo): void {
    this.borrador.set({
      ...orden,
      servicios: orden.servicios.map((servicio) => ({ ...servicio })),
    });
    this.editando.set(true);
    this.intentoGuardar.set(false);
    this.dialogo.nativeElement.showModal();
  }

  protected cerrar(event?: Event): void {
    event?.preventDefault();
    this.dialogo.nativeElement.close();
  }

  protected actualizar<K extends keyof OrdenTrabajo>(campo: K, valor: OrdenTrabajo[K]): void {
    this.borrador.update((orden) => ({ ...orden, [campo]: valor }));
  }

  protected agregarServicio(): void {
    this.borrador.update((orden) => ({
      ...orden,
      servicios: [...orden.servicios, { id: this.crearId(), nombre: '', precio: 0 }],
    }));
  }

  protected actualizarServicio(id: string, campo: 'nombre' | 'precio', valor: string | number): void {
    this.borrador.update((orden) => ({
      ...orden,
      servicios: orden.servicios.map((servicio) =>
        servicio.id === id
          ? { ...servicio, [campo]: campo === 'precio' ? this.numeroPositivo(valor) : valor }
          : servicio,
      ),
    }));
  }

  protected quitarServicio(id: string): void {
    this.borrador.update((orden) => ({
      ...orden,
      servicios: orden.servicios.filter((servicio) => servicio.id !== id),
    }));
  }

  protected totalServicios(orden = this.borrador()): number {
    return totalServicios(orden);
  }

  protected totalOrden(orden = this.borrador()): number {
    return totalOrden(orden);
  }

  protected ordenesPorEstado(estado: EstadoOrden): OrdenTrabajo[] {
    return this.ordenesFiltradas().filter((orden) => orden.estado === estado);
  }

  protected async guardar(): Promise<void> {
    this.intentoGuardar.set(true);
    const orden = this.borrador();
    if (!orden.cliente.trim() || !orden.moto.trim()) return;
    if (orden.servicios.some((servicio) => !servicio.nombre.trim())) return;

    const limpia: OrdenTrabajo = {
      ...orden,
      cliente: orden.cliente.trim(),
      telefono: orden.telefono?.trim() ?? '',
      moto: orden.moto.trim(),
      observaciones: orden.observaciones.trim(),
      manoObra: this.numeroPositivo(orden.manoObra),
      servicios: orden.servicios.map((servicio) => ({
        ...servicio,
        nombre: servicio.nombre.trim(),
        precio: this.numeroPositivo(servicio.precio),
      })),
    };

    this.guardando.set(true);
    try {
      await this.data.guardarOrden(limpia, this.editando());
      this.mostrarAviso(`Orden ${this.folioVisible(limpia.folio)} ${this.editando() ? 'actualizada' : 'creada'} correctamente.`);
      this.cerrar();
    } catch (error) {
      this.mostrarError(error instanceof Error ? error.message : 'No se pudo guardar la orden.');
    } finally {
      this.guardando.set(false);
    }
  }

  protected async descargarExcel(): Promise<void> {
    const ordenes = this.ordenesVisibles();
    if (!ordenes.length) {
      this.mostrarError('No hay órdenes para exportar.');
      return;
    }

    this.exportandoExcel.set(true);
    try {
      const { Workbook } = await import('exceljs');
      const libro = new Workbook();
      libro.creator = 'Luchex';
      libro.created = new Date();

      const hoja = libro.addWorksheet('Órdenes de trabajo', {
        views: [{ state: 'frozen', ySplit: 4 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      hoja.mergeCells('A1:J1');
      const titulo = hoja.getCell('A1');
      titulo.value = 'ÓRDENES DE TRABAJO';
      titulo.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
      titulo.alignment = { horizontal: 'center', vertical: 'middle' };
      titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263449' } };
      hoja.getRow(1).height = 28;

      hoja.mergeCells('A2:J2');
      const detalle = hoja.getCell('A2');
      detalle.value = `Generado el ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())} · ${ordenes.length} ${ordenes.length === 1 ? 'orden' : 'órdenes'}`;
      detalle.font = { italic: true, color: { argb: 'FF61728A' }, size: 10 };
      detalle.alignment = { horizontal: 'center' };

      hoja.addTable({
        name: 'TablaOrdenes',
        ref: 'A4',
        headerRow: true,
        totalsRow: true,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [
          { name: 'Orden', totalsRowLabel: 'TOTALES' },
          { name: 'Cliente' },
          { name: 'Moto' },
          { name: 'Estado' },
          { name: 'Fecha' },
          { name: 'Servicios' },
          { name: 'Total servicios', totalsRowFunction: 'sum' },
          { name: 'Mano de obra', totalsRowFunction: 'sum' },
          { name: 'Total', totalsRowFunction: 'sum' },
          { name: 'Observaciones' },
        ],
        rows: ordenes.map((orden) => [
          this.folioVisible(orden.folio),
          orden.cliente,
          orden.moto,
          NOMBRES_ESTADO[orden.estado],
          new Date(orden.fecha),
          orden.servicios.map((servicio) => `${servicio.nombre} (S/ ${servicio.precio.toFixed(2)})`).join('\n') || 'Sin servicios',
          this.totalServicios(orden),
          this.numeroPositivo(orden.manoObra),
          this.totalOrden(orden),
          orden.observaciones || '',
        ]),
      });

      const anchos = [14, 24, 24, 15, 18, 42, 17, 16, 17, 36];
      hoja.columns.forEach((columna, indice) => {
        columna.width = anchos[indice];
        columna.alignment = { vertical: 'top', wrapText: true };
      });
      for (let fila = 5; fila < 5 + ordenes.length; fila++) {
        hoja.getCell(fila, 5).numFmt = 'dd/mm/yyyy hh:mm';
        for (const columna of [7, 8, 9]) hoja.getCell(fila, columna).numFmt = '"S/ "#,##0.00';
      }
      const filaTotales = 5 + ordenes.length;
      for (const columna of [7, 8, 9]) hoja.getCell(filaTotales, columna).numFmt = '"S/ "#,##0.00';
      hoja.autoFilter = { from: 'A4', to: `J${4 + ordenes.length}` };

      const contenido = await libro.xlsx.writeBuffer();
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(new Blob([contenido], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      enlace.download = `ordenes-trabajo-${new Date().toISOString().slice(0, 10)}.xlsx`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
      this.mostrarAviso(`${ordenes.length} ${ordenes.length === 1 ? 'orden exportada' : 'órdenes exportadas'} a Excel.`);
    } catch {
      this.mostrarError('No se pudo generar el archivo de Excel.');
    } finally {
      this.exportandoExcel.set(false);
    }
  }

  protected nombreEstado(estado: EstadoOrden): string {
    return NOMBRES_ESTADO[estado] ?? estado;
  }

  protected async alternarEstado(orden: OrdenTrabajo): Promise<void> {
    const siguiente = SIGUIENTE_ESTADO[orden.estado];
    if (!siguiente || orden.estado === 'pagado') return;

    try {
      await this.data.actualizarOrden({ ...orden, estado: siguiente });
      this.mostrarAviso(`Estado de ${this.folioVisible(orden.folio)} cambiado a ${NOMBRES_ESTADO[siguiente]}.`);
    } catch (error) {
      this.mostrarError(error instanceof Error ? error.message : 'No se pudo cambiar el estado de la orden.');
    }
  }

  protected async enviarAVentas(orden: OrdenTrabajo): Promise<void> {
    try {
      const venta = this.data.crearVentaDesdeOrden(orden.id);
      await this.router.navigate(['/panel/ventas'], { queryParams: { venta: venta.id } });
    } catch (error) {
      this.mostrarError(error instanceof Error ? error.message : 'No se pudo enviar la orden a Ventas.');
    }
  }

  protected tieneVenta(ordenId: string): boolean {
    return !!this.data.ventaPorOrden(ordenId);
  }

  protected folioVisible(folio: string): string {
    const numero = folio.match(/(\d+)$/)?.[1];
    return numero ? `OT#${Number(numero)}` : folio;
  }

  private nuevaOrden(): OrdenTrabajo {
    const siguiente = this.ordenes?.().length + 1 || 1;
    return {
      id: this.crearId(),
      folio: `OT-${new Date().getFullYear()}-${String(siguiente).padStart(3, '0')}`,
      cliente: '',
      telefono: '',
      moto: '',
      estado: 'pendiente',
      observaciones: '',
      servicios: [],
      manoObra: 0,
      fecha: new Date().toISOString(),
    };
  }

  /** Aviso verde flotante sobre la tabla: se oculta solo a los 3 segundos (igual que Mecánicos). */
  private mostrarAviso(mensaje: string): void {
    clearTimeout(this.temporizadorAviso);
    this.errorAccion.set('');
    this.aviso.set(mensaje);
    this.temporizadorAviso = setTimeout(() => this.aviso.set(''), 3000);
  }

  /** Error en el recuadro rojo de arriba (se queda hasta que el usuario lo cierre). */
  private mostrarError(mensaje: string): void {
    clearTimeout(this.temporizadorAviso);
    this.aviso.set('');
    this.errorAccion.set(mensaje);
  }

  private numeroPositivo(valor: string | number): number {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero > 0 ? numero : 0;
  }

  private crearId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
