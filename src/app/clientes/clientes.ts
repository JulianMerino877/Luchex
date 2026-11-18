import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TallerDataService } from '../taller/taller-data.service';
import { OrdenTrabajo, totalOrden } from '../taller/taller.models';

export interface ClienteResumen {
  id: string;
  nombre: string;
  telefono: string;
  motos: string[];
  ultimaVisita: string;
  totalFacturado: number;
}

export function agruparClientes(ordenes: OrdenTrabajo[]): ClienteResumen[] {
  const clientes = new Map<string, ClienteResumen>();
  const ordenadas = [...ordenes].sort((a, b) => fechaValida(b.fecha) - fechaValida(a.fecha));

  for (const orden of ordenadas) {
    const nombre = orden.cliente.trim();
    if (!nombre) continue;

    const id = normalizar(nombre);
    const existente = clientes.get(id);
    if (existente) {
      existente.totalFacturado += totalOrden(orden);
      if (!existente.telefono && orden.telefono?.trim()) existente.telefono = orden.telefono.trim();
      if (orden.moto.trim() && !existente.motos.some(moto => normalizar(moto) === normalizar(orden.moto))) {
        existente.motos.push(orden.moto.trim());
      }
      continue;
    }

    clientes.set(id, {
      id,
      nombre,
      telefono: orden.telefono?.trim() ?? '',
      motos: orden.moto.trim() ? [orden.moto.trim()] : [],
      ultimaVisita: orden.fecha,
      totalFacturado: totalOrden(orden),
    });
  }

  return [...clientes.values()].sort((a, b) => fechaValida(b.ultimaVisita) - fechaValida(a.ultimaVisita));
}

function normalizar(valor: string): string {
  return valor.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function fechaValida(fecha: string): number {
  const tiempo = Date.parse(fecha);
  return Number.isNaN(tiempo) ? 0 : tiempo;
}

@Component({
  selector: 'app-clientes',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes {
  private readonly data = inject(TallerDataService);

  protected readonly busqueda = signal('');
  protected readonly cargando = this.data.cargandoOrdenes;
  protected readonly error = this.data.errorOrdenes;
  protected readonly clientes = computed(() => agruparClientes(this.data.ordenes()));
  /** Clientes que coinciden con la búsqueda (nombre, teléfono o moto, sin importar tildes). */
  protected readonly clientesVisibles = computed(() => {
    const termino = normalizar(this.busqueda());
    if (!termino) return this.clientes();
    return this.clientes().filter(cliente =>
      [cliente.nombre, cliente.telefono, ...cliente.motos].some(valor => normalizar(valor).includes(termino)),
    );
  });

  // ---------------------------------------------------------------------------------
  // Paginación (igual que en Mecánicos): 5 clientes por página con flechas ‹ ›
  // ---------------------------------------------------------------------------------
  protected readonly porPagina = 5;
  protected readonly pagina = signal(1);
  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.clientesVisibles().length / this.porPagina)));
  /** Evita quedar en una página que ya no existe (por ejemplo, después de buscar). */
  protected readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  /** Los clientes de la página actual. */
  protected readonly clientesPagina = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.clientesVisibles().slice(inicio, inicio + this.porPagina);
  });
  /** Números para el texto "Mostrando 1–5 de 12 clientes". */
  protected readonly primerResultado = computed(() =>
    this.clientesVisibles().length ? (this.paginaActual() - 1) * this.porPagina + 1 : 0);
  protected readonly ultimoResultado = computed(() =>
    Math.min(this.paginaActual() * this.porPagina, this.clientesVisibles().length));
  /** Clientes con teléfono registrado (para la etiqueta del título). */
  protected readonly conTelefono = computed(() => this.clientes().filter(cliente => cliente.telefono).length);

  /** Cambia la búsqueda y vuelve a la página 1. */
  protected buscar(texto: string): void {
    this.busqueda.set(texto);
    this.pagina.set(1);
  }
}
