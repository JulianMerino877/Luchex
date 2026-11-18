import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { AuthService } from '../core/auth/auth.service';

describe('Panel navigation', () => {
  let auth: {
    user: ReturnType<typeof signal<{ email: string } | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    configurationError: ReturnType<typeof signal<string>>;
    isAuthenticated: jasmine.Spy;
    logout: jasmine.Spy;
  };

  beforeEach(() => {
    auth = {
      user: signal<{ email: string } | null>({ email: 'admin@example.com' }),
      loading: signal(false),
      configurationError: signal(''),
      isAuthenticated: jasmine.createSpy().and.resolveTo(true),
      logout: jasmine.createSpy().and.callFake(async () => auth.user.set(null)),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: AuthService, useValue: auth }],
    });
  });

  it('redirects unauthenticated visitors to login', async () => {
    auth.user.set(null);
    auth.isAuthenticated.and.resolveTo(false);
    const harness = await RouterTestingHarness.create('/panel/clientes');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.querySelector('form')).toBeTruthy();
  });

  it('opens Clientes by default and renders each module through its route', async () => {
    const harness = await RouterTestingHarness.create('/panel');
    expect(TestBed.inject(Router).url).toBe('/panel/clientes');
    for (const [path, label, contenido] of [
      ['clientes', 'Clientes', 'Directorio de clientes'],
      ['inventario', 'Inventario', 'CONTROL DE PRODUCTOS'],
      ['ordenes', 'Órdenes', 'Órdenes de trabajo'],
      ['ventas', 'Ventas', 'Registro de Ventas'],
      ['caja', 'Caja', 'El módulo de Caja está funcionando.'],
      ['mecanicos', 'Mecánicos', 'EQUIPO DEL TALLER'],
      ['reportes', 'Reportes', 'El módulo de Reportes está funcionando.'],
    ]) {
      await harness.navigateByUrl(`/panel/${path}`);
      expect(harness.routeNativeElement?.querySelector('main')?.textContent)
        .toContain(contenido);
      expect(harness.routeNativeElement?.querySelector('[aria-current="page"]')?.textContent)
        .toContain(label);
    }
  });

  it('signs out and returns to login', async () => {
    const harness = await RouterTestingHarness.create('/panel/clientes');
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('[aria-label="Cerrar sesión"]')?.click();
    await harness.fixture.whenStable();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
