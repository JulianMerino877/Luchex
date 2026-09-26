import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-panel',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './panel.html',
  styleUrl: './panel.css',
})
export class Panel {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly collapsed = signal(false);
  protected readonly closing = signal(false);
  protected readonly error = signal('');
  protected readonly modules = [
    { path: 'clientes', label: 'Clientes', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0' },
    { path: 'inventario', label: 'Inventario', icon: 'm12 3 9 5v9l-9 5-9-5V8l9-5Z m-9 5 9 5 9-5 M12 13v9 M7.5 5.5l9 5V15' },
    { path: 'ordenes', label: 'Órdenes', icon: 'M9 4H5v18h14V4h-4 M9 2h6v4H9Z M8 10h8 M8 14h8 M8 18h5' },
    { path: 'ventas', label: 'Ventas', icon: 'M2 3h3l3 13h11l3-10H6 M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M8 12h12' },
    { path: 'caja', label: 'Caja', icon: 'M3 8h18v13H3Z M8 8V3h8v5 M3 14h18 M10 14v3h4v-3' },
    { path: 'mecanicos', label: 'Mecánicos', icon: 'M14 6a6 6 0 0 0-7 8l-5 5a2 2 0 0 0 3 3l5-5a6 6 0 0 0 8-7l-4 4-4-4 4-4Z' },
    { path: 'reportes', label: 'Reportes', icon: 'M5 2h10l4 4v16H5Z M14 2v5h5 M8 18v-4 M12 18V9 M16 18v-6' },
  ];

  constructor() {
    effect(() => {
      if (!this.auth.loading() && !this.auth.user()) {
        void this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    });
  }

  protected async logout(): Promise<void> {
    if (this.closing()) return;
    this.closing.set(true);
    this.error.set('');
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } catch {
      this.error.set('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      this.closing.set(false);
    }
  }
}
