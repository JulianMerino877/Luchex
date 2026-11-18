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
  protected readonly clientesVisibles = computed(() => {
    const termino = normalizar(this.busqueda());
    if (!termino) return this.clientes();
    return this.clientes().filter(cliente =>
      [cliente.nombre, cliente.telefono, ...cliente.motos].some(valor => normalizar(valor).includes(termino)),
    );
  });
}
