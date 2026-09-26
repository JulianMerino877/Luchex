import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    effect(() => {
      if (!this.auth.loading() && this.auth.user()) {
        void this.router.navigateByUrl('/panel/clientes', { replaceUrl: true });
      }
    });
  }

  protected async submit(): Promise<void> {
    if (this.submitting() || this.auth.loading()) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (this.auth.configurationError()) {
      this.error.set(this.auth.configurationError());
      return;
    }
    this.submitting.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      this.form.controls.password.reset();
      this.showPassword.set(false);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      const messages: Record<string, string> = {
        'auth/invalid-credential': 'El correo o la contraseña son incorrectos.',
        'auth/user-not-found': 'El correo o la contraseña son incorrectos.',
        'auth/wrong-password': 'El correo o la contraseña son incorrectos.',
        'auth/invalid-email': 'Introduce un correo electrónico válido.',
        'auth/user-disabled': 'Esta cuenta está deshabilitada. Contacta al administrador.',
        'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
        'auth/network-request-failed': 'No se pudo conectar. Revisa tu conexión a internet.',
        'auth/operation-not-allowed': 'Habilita Correo electrónico/contraseña en Firebase Authentication.',
      };
      this.error.set(messages[code ?? ''] ?? 'No se pudo iniciar sesión. Revisa la configuración de Firebase e inténtalo de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

}
