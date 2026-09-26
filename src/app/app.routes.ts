import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login').then(m => m.Login) },
  {
    path: 'panel',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./panel/panel').then(m => m.Panel),
    children: [
      { path: 'clientes', loadComponent: () => import('./clientes/clientes').then(m => m.Clientes) },
      { path: 'inventario', loadComponent: () => import('./inventario/inventario').then(m => m.Inventario) },
      { path: 'ordenes', loadComponent: () => import('./ordenes/ordenes').then(m => m.Ordenes) },
      { path: 'ventas', loadComponent: () => import('./ventas/ventas').then(m => m.Ventas) },
      { path: 'caja', loadComponent: () => import('./caja/caja').then(m => m.Caja) },
      { path: 'mecanicos', loadComponent: () => import('./mecanicos/mecanicos').then(m => m.Mecanicos) },
      { path: 'reportes', loadComponent: () => import('./reportes/reportes').then(m => m.Reportes) },
      { path: '', pathMatch: 'full', redirectTo: 'clientes' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'panel' },
  { path: '**', redirectTo: 'panel' },
];
