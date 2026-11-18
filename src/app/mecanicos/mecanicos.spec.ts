import { signal } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { formatearCelular, formatearFecha, Mecanicos } from './mecanicos';
import {
  esEspecialidadValida, esFechaValida, esNombreValido, filtrarMecanicos, formatearEspecialidad, formatearNombre,
  Mecanico, MecanicosService, siguienteFechaPago, soloDigitosCelular,
} from './mecanicos.service';

describe('Mecanicos', () => {
  let fixture: ComponentFixture<Mecanicos>;
  let servicio: {
    mecanicos: ReturnType<typeof signal<Mecanico[]>>;
    cargando: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string>>;
    agregar: jasmine.Spy;
    actualizar: jasmine.Spy;
    cambiarEstado: jasmine.Spy;
    registrarPago: jasmine.Spy;
    cargar: jasmine.Spy;
    mensajeError: (error: Error) => string;
  };
  // Juan paga en el futuro, Rosa está atrasada pero inactiva y Luis está atrasado y activo.
  const mecanicos: Mecanico[] = [
    { id: '1', nombre: 'Juan Pérez', celular: '987654321', especialidad: 'Motor', fechaIngreso: '2025-03-10', montoPago: 1200, fechaPago: '2099-11-30', activo: true, creado: null },
    { id: '2', nombre: 'Rosa Quispe', celular: '912345678', especialidad: 'Electricidad', fechaIngreso: '2020-01-05', montoPago: 1350.5, fechaPago: '2020-11-15', activo: false, creado: null },
    { id: '3', nombre: 'Luis Soto', celular: '956000111', especialidad: 'Frenos', fechaIngreso: '2019-01-31', montoPago: 900, fechaPago: '2020-01-31', activo: true, creado: null },
  ];

  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    servicio = {
      mecanicos: signal([...mecanicos]), cargando: signal(false), error: signal(''),
      agregar: jasmine.createSpy('agregar').and.resolveTo(),
      actualizar: jasmine.createSpy('actualizar').and.resolveTo(),
      cambiarEstado: jasmine.createSpy('cambiarEstado').and.resolveTo(),
      registrarPago: jasmine.createSpy('registrarPago').and.resolveTo('2020-02-29'),
      cargar: jasmine.createSpy('cargar'),
      mensajeError: error => error.message,
    };
    await TestBed.configureTestingModule({
      imports: [Mecanicos], providers: [{ provide: MecanicosService, useValue: servicio }],
    }).compileComponents();
    fixture = TestBed.createComponent(Mecanicos);
    fixture.detectChanges();
  });

  const elemento = <T extends HTMLElement>(selector: string) => fixture.nativeElement.querySelector(selector) as T;
  const filas = () => fixture.nativeElement.querySelectorAll('tbody tr').length;
  const texto = () => fixture.nativeElement.textContent as string;
  const escribir = (selector: string, valor: string) => {
    const input = elemento<HTMLInputElement>(selector);
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const enviar = async () => {
    elemento<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const abrirFormulario = () => {
    elemento<HTMLButtonElement>('.page-header button').click();
    fixture.detectChanges();
  };

  it('lists mechanics with their columns', () => {
    expect(filas()).toBe(3);
    expect(elemento<HTMLElement>('.list-heading').textContent).toContain('Plantilla de mecánicos');
    expect(elemento<HTMLElement>('.chips').textContent).toContain('3 registrados');
    expect(elemento<HTMLElement>('.chip-active').textContent).toContain('2 activos');
    expect(texto()).toContain('Juan Pérez');
    expect(texto()).toContain('987 654 321');
    expect(texto()).toContain('30/11/2099');
    const columnas = [...fixture.nativeElement.querySelectorAll('th')].map((th: HTMLElement) => th.textContent?.trim());
    expect(columnas).toEqual(['MECÁNICO', 'CELULAR', 'ESPECIALIDAD', 'INGRESO', 'PAGO', 'FECHA DE PAGO', 'EDITAR', 'ESTADO']);
  });

  it('filters by name, phone or specialty ignoring accents', () => {
    escribir('input[type="search"]', 'electricidad');
    expect(filas()).toBe(1);
    escribir('input[type="search"]', 'perez');
    expect(texto()).toContain('Juan Pérez');
    escribir('input[type="search"]', '912 345');
    expect(filas()).toBe(1);
    expect(texto()).toContain('Rosa Quispe');
    escribir('input[type="search"]', 'nadie');
    expect(texto()).toContain('No encontramos a ese mecánico');
  });

  it('alerts only active mechanics whose payment date arrived', () => {
    const alertas = fixture.nativeElement.querySelectorAll('.pay-alert');
    expect(alertas.length).toBe(1);
    expect(alertas[0].textContent).toContain('Toca pagar a Luis Soto');
    expect(alertas[0].textContent).toContain('S/ 900.00');
    expect(alertas[0].textContent).toContain('Atrasado');
    expect(texto()).not.toContain('Toca pagar a Rosa Quispe');
  });

  it('registers the payment and shows the next payment date', fakeAsync(() => {
    elemento<HTMLButtonElement>('[aria-label="Registrar pago de Luis Soto"]').click();
    tick();
    fixture.detectChanges();
    expect(servicio.registrarPago).toHaveBeenCalledOnceWith(mecanicos[2]);
    expect(elemento<HTMLElement>('.toast').textContent).toContain('Pago de Luis Soto registrado. Próximo pago: 29/02/2020.');
    tick(3000);
  }));

  it('hides the payments area when nothing is due', () => {
    servicio.mecanicos.set([mecanicos[0], mecanicos[1]]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payments')).toBeNull();
  });

  it('paginates with left and right arrows', () => {
    servicio.mecanicos.set(Array.from({ length: 10 }, (_, i) => ({ ...mecanicos[0], id: `m${i}`, nombre: `Mecánico ${i + 1}` })));
    fixture.detectChanges();
    const anterior = elemento<HTMLButtonElement>('[aria-label="Página anterior"]');
    const siguiente = elemento<HTMLButtonElement>('[aria-label="Página siguiente"]');
    expect(filas()).toBe(5);
    expect(texto()).toContain('Mostrando 1–5 de 10 mecánicos');
    expect(anterior.disabled).toBeTrue();
    siguiente.click();
    fixture.detectChanges();
    expect(filas()).toBe(5);
    expect(texto()).toContain('Mostrando 6–10 de 10 mecánicos');
    expect(siguiente.disabled).toBeTrue();
    escribir('input[type="search"]', 'Mecánico');
    expect(elemento<HTMLElement>('.current-page').textContent?.trim()).toBe('1');
  });

  it('registers a new mechanic and hides the floating notice after three seconds', fakeAsync(() => {
    abrirFormulario();
    escribir('#mechanic-name', '  carlos   RAMOS de la cruz ');
    escribir('#mechanic-phone', '956 111 222');
    escribir('#mechanic-specialty', 'FRENOS');
    escribir('#mechanic-start', '2025-01-02');
    escribir('#mechanic-pay-date', '2025-02-01');
    escribir('#mechanic-amount', '950.75');
    elemento<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    tick();
    fixture.detectChanges();
    expect(servicio.agregar).toHaveBeenCalledOnceWith({
      nombre: 'Carlos Ramos de la Cruz', celular: '956111222', especialidad: 'Frenos', fechaIngreso: '2025-01-02', montoPago: 950.75, fechaPago: '2025-02-01',
    });
    expect(elemento<HTMLElement>('.list-card .toast').textContent).toContain('Mecánico Carlos Ramos de la Cruz registrado correctamente.');
    tick(3000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast')).toBeNull();
  }));

  it('blocks a payment date before the start date', async () => {
    abrirFormulario();
    escribir('#mechanic-name', 'Carlos Ramos');
    escribir('#mechanic-phone', '956111222');
    escribir('#mechanic-specialty', 'Frenos');
    escribir('#mechanic-start', '2025-05-10');
    escribir('#mechanic-pay-date', '2025-05-01');
    escribir('#mechanic-amount', '100');
    await enviar();
    expect(servicio.agregar).not.toHaveBeenCalled();
    expect(texto()).toContain('No puede ser anterior a la fecha de ingreso.');
  });

  it('only lets digits into the phone, up to 9, starting with 9', async () => {
    abrirFormulario();
    escribir('#mechanic-phone', 'ab9-87 65x43219999');
    expect(elemento<HTMLInputElement>('#mechanic-phone').value).toBe('987654321');
    escribir('#mechanic-phone', '12345');
    escribir('#mechanic-name', 'Carlos Ramos');
    escribir('#mechanic-specialty', 'Frenos');
    escribir('#mechanic-amount', '100');
    await enviar();
    expect(servicio.agregar).not.toHaveBeenCalled();
    expect(texto()).toContain('Debe tener 9 dígitos y empezar con 9.');
  });

  it('removes digits from the name, tidies it on blur and requires a last name', async () => {
    abrirFormulario();
    const nombre = elemento<HTMLInputElement>('#mechanic-name');
    escribir('#mechanic-name', 'juan2 p@erez');
    expect(nombre.value).toBe('juan perez');
    nombre.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(nombre.value).toBe('Juan Perez');

    escribir('#mechanic-name', 'Juan');
    escribir('#mechanic-phone', '956111222');
    escribir('#mechanic-specialty', 'Frenos');
    escribir('#mechanic-amount', '100');
    await enviar();
    expect(servicio.agregar).not.toHaveBeenCalled();
    expect(texto()).toContain('Escribe nombre y apellido, solo con letras.');
  });

  it('rejects amounts with more than two decimals and future start dates', async () => {
    abrirFormulario();
    escribir('#mechanic-name', 'Carlos Ramos');
    escribir('#mechanic-phone', '956111222');
    escribir('#mechanic-specialty', 'Frenos');
    escribir('#mechanic-amount', '10.555');
    escribir('#mechanic-start', '2099-01-01');
    escribir('#mechanic-pay-date', '2099-02-01');
    await enviar();
    expect(servicio.agregar).not.toHaveBeenCalled();
    expect(texto()).toContain('Usa máximo 2 decimales');
    expect(texto()).toContain('No puede ser una fecha futura.');
  });

  it('edits an existing mechanic', async () => {
    elemento<HTMLButtonElement>('[aria-label="Editar Rosa Quispe"]').click();
    fixture.detectChanges();
    expect(elemento<HTMLInputElement>('#mechanic-name').value).toBe('Rosa Quispe');
    escribir('#mechanic-amount', '1500');
    await enviar();
    expect(servicio.actualizar).toHaveBeenCalledOnceWith('2', jasmine.objectContaining({ montoPago: 1500 }));
  });

  it('shows each mechanic status and toggles it with the switch', fakeAsync(() => {
    const juan = elemento<HTMLButtonElement>('[aria-label="Desactivar Juan Pérez"]');
    const rosa = elemento<HTMLButtonElement>('[aria-label="Activar Rosa Quispe"]');
    expect(juan.getAttribute('aria-checked')).toBe('true');
    expect(juan.textContent).toContain('Activo');
    expect(rosa.getAttribute('aria-checked')).toBe('false');
    expect(rosa.textContent).toContain('Inactivo');

    juan.click();
    tick();
    fixture.detectChanges();
    expect(servicio.cambiarEstado).toHaveBeenCalledOnceWith('1', false);
    expect(elemento<HTMLElement>('.toast').textContent).toContain('Mecánico Juan Pérez desactivado.');
    tick(3000);
  }));

  it('shows an error when the status cannot be changed', fakeAsync(() => {
    servicio.cambiarEstado.and.rejectWith(new Error('Sin permiso'));
    elemento<HTMLButtonElement>('[aria-label="Activar Rosa Quispe"]').click();
    tick();
    fixture.detectChanges();
    expect(elemento<HTMLElement>('.notice.failure').textContent).toContain('Sin permiso');
  }));

  it('shows the load error with a retry button', () => {
    servicio.error.set('Sin conexión');
    fixture.detectChanges();
    expect(texto()).toContain('Sin conexión');
    elemento<HTMLButtonElement>('.empty-state button').click();
    expect(servicio.cargar).toHaveBeenCalled();
  });
});

describe('Mecanicos helpers', () => {
  it('validates real calendar dates', () => {
    expect(esFechaValida('2024-02-29')).toBeTrue();
    expect(esFechaValida('2026-02-29')).toBeFalse();
    expect(esFechaValida('2026-13-01')).toBeFalse();
    expect(esFechaValida('')).toBeFalse();
  });

  it('tidies names and specialties', () => {
    expect(formatearNombre('  juan   PÉREZ de la cruz ')).toBe('Juan Pérez de la Cruz');
    expect(formatearNombre('ñato quispe')).toBe('Ñato Quispe');
    expect(formatearEspecialidad('MOTOR ,frenos  y luces')).toBe('Motor, frenos y luces');
  });

  it('validates names and specialties', () => {
    expect(esNombreValido('Juan Pérez')).toBeTrue();
    expect(esNombreValido('María de la Cruz')).toBeTrue();
    expect(esNombreValido('Juan')).toBeFalse();
    expect(esNombreValido('Juan P3rez')).toBeFalse();
    expect(esEspecialidadValida('Motor, frenos')).toBeTrue();
    expect(esEspecialidadValida('M1')).toBeFalse();
  });

  it('keeps only digits in the phone', () => {
    expect(soloDigitosCelular('987-654 32199')).toBe('987654321');
  });

  it('moves the payment date one month ahead', () => {
    expect(siguienteFechaPago('2026-11-18')).toBe('2026-12-18');
    expect(siguienteFechaPago('2026-12-15')).toBe('2027-01-15');
    expect(siguienteFechaPago('2026-01-31')).toBe('2026-02-28');
    expect(siguienteFechaPago('2024-01-31')).toBe('2024-02-29');
  });

  it('formats cell phones', () => {
    expect(formatearCelular('987654321')).toBe('987 654 321');
    expect(formatearCelular('')).toBe('—');
  });

  it('formats dates without timezone shifts', () => {
    expect(formatearFecha('2026-01-01')).toBe('01/01/2026');
    expect(formatearFecha('basura')).toBe('—');
  });

  it('filters mechanics', () => {
    const lista = [
      { nombre: 'Ána', celular: '900000001', especialidad: 'Motor' },
      { nombre: 'Luis', celular: '900000002', especialidad: 'Frenos' },
    ] as Mecanico[];
    expect(filtrarMecanicos(lista, 'ana').length).toBe(1);
    expect(filtrarMecanicos(lista, 'FRENOS')[0].nombre).toBe('Luis');
  });
});
