import { Injectable, signal } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { environment } from '../../../enviroments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUser = signal<User | null>(null);
  private readonly initializing = signal(true);
  private readonly initializationError = signal('');
  readonly user = this.currentUser.asReadonly();
  readonly loading = this.initializing.asReadonly();
  readonly configurationError = this.initializationError.asReadonly();
  private auth?: Auth;

  constructor() {
    const config = environment.firebase;
    if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
      this.initializationError.set('Falta configurar Firebase en src/enviroments/environment.ts.');
      this.initializing.set(false);
      return;
    }

    try {
      this.auth = getAuth(getApps().length ? getApp() : initializeApp(config));
      onAuthStateChanged(this.auth, (user) => {
        this.currentUser.set(user);
        this.initializing.set(false);
      }, () => {
        this.initializationError.set('No se pudo recuperar la sesión. Recarga la página.');
        this.initializing.set(false);
      });
    } catch {
      this.initializationError.set('Revisa los valores de Firebase en src/enviroments/environment.ts.');
      this.initializing.set(false);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.auth) return false;
    await this.auth.authStateReady();
    return this.auth.currentUser !== null;
  }

  async login(email: string, password: string): Promise<void> {
    if (!this.auth) throw new Error(this.configurationError());
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  async logout(): Promise<void> {
    if (this.auth) await signOut(this.auth);
  }
}
