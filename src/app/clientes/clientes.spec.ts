import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OrdenesService } from '../ordenes/ordenes.service';
import { OrdenTrabajo } from '../taller/taller.models';
import { agruparClientes, Clientes } from './clientes';

describe('Clientes', () => {
  it('should create the component', async () => {
    await TestBed.configureTestingModule({
      imports: [Clientes],
      providers: [{ provide: OrdenesService, useValue: {
        ordenes: signal([]), cargando: signal(false), error: signal(''),
      } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(Clientes);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('agrupa al mismo cliente y conserva sus motos y órdenes', () => {
    const base: OrdenTrabajo = {
      id: '1', folio: 'OT-1', cliente: 'Ana Pérez', telefono: '987654321', moto: 'Honda Wave', estado: 'pendiente',
      observaciones: '', servicios: [], manoObra: 20, fecha: '2026-11-10T10:00:00Z',
    };
    const clientes = agruparClientes([
      base,
      { ...base, id: '2', cliente: 'ana perez', moto: 'Yamaha FZ', manoObra: 30, fecha: '2026-11-12T10:00:00Z' },
    ]);

    expect(clientes.length).toBe(1);
    expect(clientes[0].nombre).toBe('ana perez');
    expect(clientes[0].motos).toEqual(['Yamaha FZ', 'Honda Wave']);
    expect(clientes[0].telefono).toBe('987654321');
    expect(clientes[0].totalFacturado).toBe(50);
  });
});
